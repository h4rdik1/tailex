import { z } from 'zod';
import { RESUME_LIMITS, ResumeDataSchema } from './resume.ts';

const shortText = z.string().max(RESUME_LIMITS.shortText);
const bulletText = z.string().max(RESUME_LIMITS.bullet);

/**
 * Exactly what the LLM must return for prompt `parse-v1` (docs/SPEC.md §11): no ids, no contact.
 * Our code validates it, then assigns ids and attaches the contact it redacted itself.
 * `.strict()` rejects extra keys, so the model can't smuggle in fields we didn't ask for.
 */
export const LlmParsedResumeSchema = z
  .object({
    skills: z
      .array(
        z
          .object({
            category: shortText,
            items: z.array(shortText).max(RESUME_LIMITS.skillsPerGroup),
          })
          .strict(),
      )
      .max(RESUME_LIMITS.skillGroups),
    experience: z
      .array(
        z
          .object({
            title: shortText,
            company: shortText,
            location: shortText,
            startDate: shortText,
            endDate: shortText,
            bullets: z.array(bulletText).max(RESUME_LIMITS.bulletsPerEntry),
          })
          .strict(),
      )
      .max(RESUME_LIMITS.experience),
    projects: z
      .array(
        z
          .object({
            name: shortText,
            tech: z.array(shortText).max(RESUME_LIMITS.techPerProject),
            bullets: z.array(bulletText).max(RESUME_LIMITS.bulletsPerEntry),
          })
          .strict(),
      )
      .max(RESUME_LIMITS.projects),
    education: z
      .array(
        z
          .object({
            school: shortText,
            degree: shortText,
            location: shortText,
            startYear: shortText,
            endYear: shortText,
          })
          .strict(),
      )
      .max(RESUME_LIMITS.education),
  })
  .strict();
export type LlmParsedResume = z.infer<typeof LlmParsedResumeSchema>;

/** Response of `POST /api/parse`. */
export const ParseResponseSchema = z.object({
  resume: ResumeDataSchema,
  /** The exact text that was sent to the LLM, shown in the UI's "See what's sent" panel. */
  redactedPreview: z.string(),
});
export type ParseResponse = z.infer<typeof ParseResponseSchema>;

/** Upload limits (docs/SPEC.md §6). */
export const UPLOAD_LIMITS = {
  maxBytes: 1024 * 1024,
  /** Longer than any real resume; protects the LLM call (cost, time) from huge documents. */
  maxTextChars: 20_000,
  contentTypes: {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
} as const;
