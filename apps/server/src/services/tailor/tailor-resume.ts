import {
  LlmTailorOutputSchema,
  TAILOR_LIMITS,
  type ResumeData,
  type TailorResponse,
  type TailorSuggestion,
} from '@tailex/shared';
import { buildTailorUserMessage, TAILOR_SYSTEM_PROMPT } from '../../prompts/tailor.ts';
import { analyze, resumeSearchText } from '../keywords/analyze.ts';
import { findSkill } from '../keywords/skills.ts';
import { toProviderJsonSchema } from '../llm/provider-schema.ts';
import { LlmError, type LlmProvider } from '../llm/types.ts';
import { redactText, restorePlaceholders, type FoundValues } from '../redact/redact-text.ts';
import type { TruthGuard } from './truth-guard.ts';

/** Low temperature: we want a faithful rewrite, not creativity (CLAUDE.md, Prompts). */
const TAILOR_TEMPERATURE = 0.2;

/** At most 2 LLM calls per request: the first try and one retry on invalid output. */
const MAX_ATTEMPTS = 2;

const TAILOR_JSON_SCHEMA = toProviderJsonSchema(LlmTailorOutputSchema);

/** The request itself is wrong (not the AI): the route answers 400 with this message. */
export class TailorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TailorInputError';
  }
}

export interface TailorInput {
  resume: ResumeData;
  jd: string;
  confirmedSkills: readonly string[];
  provider: LlmProvider;
  apiKey: string;
  truthGuard: TruthGuard;
}

interface Bullet {
  id: string;
  text: string;
  /** What the redaction replaced in this bullet, to put back into a rewrite. */
  found: FoundValues;
  redacted: string;
}

/**
 * Job description + resume → bullet rewrites, each checked by the truth guard (docs/SPEC.md §8).
 * Single call, no tools, no agent loop. The AI sees only redacted text, never the confirmed
 * skills (those are added to the Skills section by our own code, ADR-039).
 */
export async function tailorResume(input: TailorInput): Promise<TailorResponse> {
  const { resume, jd, provider, apiKey } = input;
  const confirmedSkills = checkConfirmedSkills(input.confirmedSkills, resume, jd);

  const all = collectBullets(resume);
  const considered = all.slice(0, TAILOR_LIMITS.bullets);
  if (considered.length === 0) {
    return { suggestions: [], bulletsConsidered: 0, bulletsTotal: 0, ignored: 0 };
  }

  const name = resume.contact.name;
  const bullets: Bullet[] = considered.map((bullet) => {
    const scrubbed = redactText(bullet.text, name);
    return { ...bullet, found: scrubbed.found, redacted: scrubbed.text };
  });
  const request = {
    apiKey,
    system: TAILOR_SYSTEM_PROMPT,
    user: buildTailorUserMessage(
      redactText(jd, name).text,
      bullets.map((b) => ({ id: b.id, text: b.redacted })),
    ),
    jsonSchema: TAILOR_JSON_SCHEMA,
    temperature: TAILOR_TEMPERATURE,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await callProvider(provider, request);
    const parsed = LlmTailorOutputSchema.safeParse(raw);
    if (!parsed.success) continue;

    const outcome = judge(parsed.data.suggestions, bullets, {
      guard: input.truthGuard,
      resumeText: resumeSearchText(resume),
      confirmedSkills,
    });
    return { ...outcome, bulletsConsidered: bullets.length, bulletsTotal: all.length };
  }
  throw new LlmError('PARSE_INVALID_OUTPUT');
}

/** Every confirmed skill must be one the job description asks for (and is spelled canonically). */
function checkConfirmedSkills(names: readonly string[], resume: ResumeData, jd: string): string[] {
  const { matched, missing } = analyze(resume, jd);
  const asked = new Set([...matched, ...missing.map((m) => m.skill)].map((s) => s.toLowerCase()));
  const canonical: string[] = [];
  for (const name of names) {
    const skill = findSkill(name);
    if (skill === undefined || !asked.has(skill.canonical.toLowerCase())) {
      throw new TailorInputError('A confirmed skill is not one the job description asks for.');
    }
    if (!canonical.includes(skill.canonical)) canonical.push(skill.canonical);
  }
  return canonical;
}

/** Experience bullets, then project bullets, in resume order; empty ones are skipped. */
function collectBullets(resume: ResumeData): { id: string; text: string }[] {
  const bullets = [...resume.experience, ...resume.projects]
    .flatMap((entry) => entry.bullets)
    .filter((bullet) => bullet.text.trim() !== '');
  const ids = new Set(bullets.map((bullet) => bullet.id));
  if (ids.size !== bullets.length) {
    throw new TailorInputError('Two bullets share the same id. Reload the page and try again.');
  }
  return bullets.map((bullet) => ({ id: bullet.id, text: bullet.text }));
}

interface Judging {
  guard: TruthGuard;
  resumeText: string;
  confirmedSkills: readonly string[];
}

function sameText(a: string, b: string): boolean {
  const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();
  return squash(a) === squash(b);
}

/** Turns the AI's suggestions into checked ones. Nothing the guard blocks is dropped silently. */
function judge(
  suggestions: readonly { id: string; suggested: string; reason: string }[],
  bullets: readonly Bullet[],
  { guard, resumeText, confirmedSkills }: Judging,
): Pick<TailorResponse, 'suggestions' | 'ignored'> {
  const byId = new Map(bullets.map((bullet) => [bullet.id, bullet]));
  const seen = new Set<string>();
  const result: TailorSuggestion[] = [];
  let ignored = 0;

  for (const item of suggestions) {
    const bullet = byId.get(item.id);
    // A suggestion for a bullet we never sent, or a second one for the same bullet, is ignored.
    if (bullet === undefined || seen.has(item.id)) {
      ignored += 1;
      continue;
    }
    seen.add(item.id);

    const base = { id: bullet.id, original: bullet.text, reason: item.reason };
    const blocked = (suggested: string, reason: string): TailorSuggestion => ({
      ...base,
      suggested,
      status: 'blocked',
      blockedReason: reason,
    });

    if (item.suggested.trim() === '') {
      result.push(blocked('', 'The rewrite is empty.'));
      continue;
    }
    const restored = restorePlaceholders(item.suggested, bullet.found);
    if (restored === null) {
      result.push(
        blocked(item.suggested, 'The rewrite changed a placeholder for an email, link or phone.'),
      );
      continue;
    }
    if (sameText(restored, bullet.text)) {
      ignored += 1; // nothing to review
      continue;
    }
    if (restored.length > TAILOR_LIMITS.suggested) {
      result.push(blocked(restored, 'The rewrite is longer than a bullet can be.'));
      continue;
    }

    const verdict = runGuard(guard, {
      original: bullet.text,
      suggested: restored,
      resumeText,
      confirmedSkills,
    });
    result.push(
      verdict.ok
        ? { ...base, suggested: restored, status: 'ok' }
        : blocked(restored, verdict.reason),
    );
  }
  return { suggestions: result, ignored };
}

/** If the guard itself fails, the answer is "blocked": a broken check never lets text through. */
function runGuard(guard: TruthGuard, input: Parameters<TruthGuard>[0]): ReturnType<TruthGuard> {
  try {
    return guard(input);
  } catch {
    return {
      ok: false,
      reason: 'The truth check could not run, so this rewrite was not accepted.',
    };
  }
}

/** Invalid JSON from the provider counts as "invalid output" (retryable); other errors bubble up. */
async function callProvider(
  provider: LlmProvider,
  request: Parameters<LlmProvider['generateJson']>[0],
): Promise<unknown> {
  try {
    return await provider.generateJson(request);
  } catch (error) {
    if (error instanceof LlmError && error.code === 'PARSE_INVALID_OUTPUT') return undefined;
    throw error;
  }
}
