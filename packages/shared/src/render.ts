import { z } from 'zod';
import { ResumeDataSchema } from './resume.ts';

/** "tight" shrinks margins and gaps when the resume spills onto a second page. */
export const SpacingSchema = z.enum(['normal', 'tight']);
export type Spacing = z.infer<typeof SpacingSchema>;

/** Body of `POST /api/render`. */
export const RenderRequestSchema = z.object({
  resume: ResumeDataSchema,
  spacing: SpacingSchema.default('normal'),
});
export type RenderRequest = z.infer<typeof RenderRequestSchema>;

/** One readable compile error, parsed from the pdflatex log (raw logs are never sent). */
export const CompileErrorDetailSchema = z.object({
  line: z.number().int().nullable(),
  message: z.string(),
});
export type CompileErrorDetail = z.infer<typeof CompileErrorDetailSchema>;

/** Response headers of a successful render. */
export const RENDER_HEADERS = {
  pageCount: 'x-page-count',
  /** URI-encoded JSON array of characters that were dropped because pdflatex can't print them. */
  warnings: 'x-render-warnings',
} as const;
