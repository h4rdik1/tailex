import { z } from 'zod';
import skillsData from './skills.json' with { type: 'json' };
import { normalizeAlias } from './normalize.ts';

/**
 * The curated skills list (docs/DECISIONS.md ADR-009). The JSON is checked when the server
 * starts, so a typo in the data is a loud startup error, not a silent missed match.
 *
 * `ambiguous` marks names that are also ordinary English words or single letters ("Go", "R",
 * "C", "Swift", "Excel", "Express"). `true` means the skill's own name; a list names the
 * aliases. Those only count with a capital letter and in a list-like context (see match.ts).
 */
const SkillEntrySchema = z.object({
  canonical: z.string().min(1),
  category: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  ambiguous: z.union([z.boolean(), z.array(z.string())]).optional(),
});
const SkillsFileSchema = z.array(SkillEntrySchema);

export interface AliasRule {
  canonical: string;
  category: string;
  /** Normalised text to look for (lowercase, hyphens as spaces). */
  alias: string;
  /** Needs a capital letter and a list-like context to count. */
  ambiguous: boolean;
}

export interface SkillInfo {
  canonical: string;
  category: string;
}

const entries = SkillsFileSchema.parse(skillsData);

function buildRules(): AliasRule[] {
  const rules: AliasRule[] = [];
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const ambiguousAliases = new Set(
      entry.ambiguous === true
        ? [normalizeAlias(entry.canonical)]
        : (entry.ambiguous || []).map(normalizeAlias),
    );
    for (const raw of [entry.canonical, ...entry.aliases]) {
      const alias = normalizeAlias(raw);
      const owner = seen.get(alias);
      if (owner !== undefined && owner !== entry.canonical) {
        throw new Error(`skills.json: "${alias}" belongs to both ${owner} and ${entry.canonical}`);
      }
      if (owner === undefined) {
        seen.set(alias, entry.canonical);
        rules.push({
          canonical: entry.canonical,
          category: entry.category,
          alias,
          ambiguous: ambiguousAliases.has(alias),
        });
      }
    }
  }
  // Longest first, so "react native" is found before "react".
  return rules.sort((a, b) => b.alias.length - a.alias.length);
}

export const ALIAS_RULES: readonly AliasRule[] = buildRules();

const BY_CANONICAL = new Map<string, SkillInfo>(
  entries.map((entry) => [
    entry.canonical.toLowerCase(),
    { canonical: entry.canonical, category: entry.category },
  ]),
);

/** The skill for a name in any capitalisation ("node.js" → Node.js), or undefined. */
export function findSkill(name: string): SkillInfo | undefined {
  return BY_CANONICAL.get(name.trim().toLowerCase());
}

export function allCanonicalSkills(): string[] {
  return entries.map((entry) => entry.canonical);
}
