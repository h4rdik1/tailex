import { z } from 'zod';
import { ResumeDataSchema } from './resume.ts';

/**
 * The resume design comes in LAYOUT_LEVELS sizes, from 1 (smallest) up. Font, line spacing,
 * gaps and margins all grow together, so every size has the same look and rhythm. The server
 * picks the largest size that still fits on one page (docs/DECISIONS.md ADR-036); the client
 * never chooses.
 */
export const LAYOUT_LEVELS = 14;
export const LayoutSchema = z.number().int().min(1).max(LAYOUT_LEVELS);
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
  /** The size level the server chose, 1 to LAYOUT_LEVELS. */
  layout: 'x-layout',
  /** How full the page is, 0–100 (%). Missing when it could not be measured. */
  pageFill: 'x-page-fill',
} as const;
