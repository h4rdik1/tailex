import { z } from 'zod';

/** `GET /api/health` response. The web app also uses it to detect Cloud Run cold starts. */
export const HealthResponseSchema = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
