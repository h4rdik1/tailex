import { z } from 'zod';
import { ResumeDataSchema } from './resume.ts';

/**
 * Density profiles, roomiest first. The server picks the roomiest one that still fits on one
 * page (docs/DECISIONS.md ADR-036); the client never chooses.
 */
export const LayoutSchema = z.enum(['roomy', 'spacious', 'comfortable', 'compact', 'dense']);
export type Layout = z.infer<typeof LayoutSchema>;

/** Body of `POST /api/render`. Unknown keys (e.g. an old `spacing` field) are ignored. */
export const RenderRequestSchema = z.object({
  resume: ResumeDataSchema,
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
  /** The density profile the server chose (a LayoutSchema value). */
  layout: 'x-layout',
  /** How full the page is, 0–100 (%). Missing when it could not be measured. */
  pageFill: 'x-page-fill',
} as const;
