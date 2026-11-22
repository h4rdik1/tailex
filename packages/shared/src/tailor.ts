import { z } from 'zod';
import { RESUME_LIMITS, ResumeDataSchema } from './resume.ts';

/** Limits for the tailoring flow (docs/SPEC.md §8). Zod enforces every one of them. */
export const TAILOR_LIMITS = {
  /** About three pages of text: longer than any real job description. */
  jdChars: 15_000,
  /** Bullets sent to the LLM per request (the first ones, in resume order). */
  bullets: 40,
  /** A suggestion replaces a bullet, so it may not be longer than a bullet can be. */
  suggested: RESUME_LIMITS.bullet,
  reason: 300,
  confirmedSkills: 30,
} as const;

/** The job description, trimmed. Empty or whitespace-only is rejected with a readable message. */
export const JdSchema = z
  .string()
  .trim()
  .min(1, 'Paste a job description first.')
  .max(
    TAILOR_LIMITS.jdChars,
    `The job description is longer than ${String(TAILOR_LIMITS.jdChars)} characters.`,
  );

/** Body of `POST /api/keywords`. It never uses the LLM, so it never reads the key. */
export const KeywordsRequestSchema = z.object({
  resume: ResumeDataSchema,
  jd: JdSchema,
});
export type KeywordsRequest = z.infer<typeof KeywordsRequestSchema>;

/** Where a skill the user confirms should go: an existing skills group, or a new one. */
export const SuggestedGroupSchema = z.object({
  /** The id of an existing skills group, or null when a new group should be created. */
  groupId: z.string().nullable(),
  /** The group's name (existing) or the name for the new group. */
  label: z.string(),
});
export type SuggestedGroup = z.infer<typeof SuggestedGroupSchema>;

export const MissingSkillSchema = z.object({
  /** The skill's canonical spelling, e.g. "Node.js". This is the value to send back to confirm it. */
  skill: z.string(),
  category: z.string(),
  /** True when the job description marks it as required ("must have", a Requirements list...). */
  required: z.boolean(),
  suggestedGroup: SuggestedGroupSchema,
});
export type MissingSkill = z.infer<typeof MissingSkillSchema>;

export const KeywordsResponseSchema = z.object({
  /** Skills the job description asks for that the resume already shows. */
  matched: z.array(z.string()),
  /** Skills the job description asks for that the resume does not show. */
  missing: z.array(MissingSkillSchema),
  /** Skills in the resume's Skills section that the job description does not ask for. */
  extra: z.array(z.string()),
  /** 0 to 100: weighted share of the job description's skills the resume shows (required ×2). */
  score: z.number().int().min(0).max(100),
  /** How many distinct skills were recognised in the job description (0 = nothing to match). */
  jdSkillCount: z.number().int().min(0),
});
export type KeywordsResponse = z.infer<typeof KeywordsResponseSchema>;

/** Body of `POST /api/tailor`. `confirmedSkills` are canonical names the job description asks for. */
export const TailorRequestSchema = z.object({
  resume: ResumeDataSchema,
  jd: JdSchema,
  confirmedSkills: z
    .array(z.string().min(1).max(60))
    .max(TAILOR_LIMITS.confirmedSkills)
    .default([]),
});
export type TailorRequest = z.infer<typeof TailorRequestSchema>;

/**
 * Exactly what the LLM must return for prompt `tailor-v1` (docs/SPEC.md §11). `.strict()` rejects
 * extra keys. The truth guard, not this schema, decides whether a suggestion is true.
 */
export const LlmTailorOutputSchema = z
  .object({
    suggestions: z
      .array(
        z
          .object({
            id: z.string(),
            suggested: z.string().max(TAILOR_LIMITS.suggested),
            reason: z.string().max(TAILOR_LIMITS.reason),
          })
          .strict(),
      )
      .max(TAILOR_LIMITS.bullets),
  })
  .strict();
export type LlmTailorOutput = z.infer<typeof LlmTailorOutputSchema>;

export const SuggestionStatusSchema = z.enum(['ok', 'blocked']);

export const TailorSuggestionSchema = z.object({
  /** The id of the bullet this rewrite is for (assigned by our code, never by the LLM). */
  id: z.string(),
  original: z.string(),
  suggested: z.string(),
  reason: z.string(),
  status: SuggestionStatusSchema,
  /** Why the truth guard blocked it. Present only when status is "blocked". */
  blockedReason: z.string().optional(),
});
export type TailorSuggestion = z.infer<typeof TailorSuggestionSchema>;

export const TailorResponseSchema = z.object({
  suggestions: z.array(TailorSuggestionSchema),
  /** How many bullets were sent to the AI, out of how many the resume has. */
  bulletsConsidered: z.number().int().min(0),
  bulletsTotal: z.number().int().min(0),
  /** Suggestions we ignored because they were for an unknown or repeated bullet, or changed nothing. */
  ignored: z.number().int().min(0),
});
export type TailorResponse = z.infer<typeof TailorResponseSchema>;
