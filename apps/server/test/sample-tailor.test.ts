import { describe, expect, it } from 'vitest';
import {
  FICTIONAL_RESUME,
  SAMPLE_JD,
  SAMPLE_TAILOR_RESPONSE,
  TAILOR_LIMITS,
  TailorResponseSchema,
} from '@tailex/shared';
import { analyze, resumeSearchText } from '../src/services/keywords/analyze.ts';
import { truthGuard } from '../src/services/tailor/truth-guard.ts';

/** The stub blocks even an unchanged bullet; the real guard accepts it. */
const guardIsStillAStub = !truthGuard({
  original: 'Built it.',
  suggested: 'Built it.',
  resumeText: 'Built it.',
  confirmedSkills: [],
}).ok;

const bulletText = (id: string): string | undefined =>
  [...FICTIONAL_RESUME.experience, ...FICTIONAL_RESUME.projects]
    .flatMap((entry) => entry.bullets)
    .find((bullet) => bullet.id === id)?.text;

describe('sample mode data for the Tailor step', () => {
  it('has the shape of a real /api/tailor answer', () => {
    expect(TailorResponseSchema.safeParse(SAMPLE_TAILOR_RESPONSE).success).toBe(true);
  });

  it('every canned rewrite is about a real bullet of the sample resume, word for word', () => {
    for (const item of SAMPLE_TAILOR_RESPONSE.suggestions) {
      expect(bulletText(item.id)).toBe(item.original);
    }
  });

  it('has unique ids, rewrites that fit in a bullet, and a reason for every blocked one', () => {
    const ids = SAMPLE_TAILOR_RESPONSE.suggestions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of SAMPLE_TAILOR_RESPONSE.suggestions) {
      expect(item.suggested.length).toBeLessThanOrEqual(TAILOR_LIMITS.suggested);
      expect(item.suggested).not.toBe(item.original);
      expect(item.status === 'blocked').toBe(item.blockedReason !== undefined);
    }
  });

  it('shows both outcomes, so the demo teaches the guard', () => {
    const statuses = SAMPLE_TAILOR_RESPONSE.suggestions.map((s) => s.status);

    expect(statuses).toContain('ok');
    expect(statuses).toContain('blocked');
  });

  it('the sample job description gives a believable analysis of the sample resume', () => {
    const result = analyze(FICTIONAL_RESUME, SAMPLE_JD);

    expect(result.matched).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Docker']));
    const terraform = result.missing.find((m) => m.skill === 'Terraform');
    expect(terraform?.required).toBe(true);
    expect(result.missing.find((m) => m.skill === 'Kubernetes')?.required).toBe(false);
    expect(result.missing.find((m) => m.skill === 'GraphQL')?.required).toBe(false);
    expect(result.score).toBeGreaterThan(30);
    expect(result.score).toBeLessThan(100);
  });

  // Skipped until the owner writes the guard. Then it fails if a canned verdict and the real one differ.
  it.skipIf(guardIsStillAStub)('each canned verdict matches what the real truth guard says', () => {
    for (const item of SAMPLE_TAILOR_RESPONSE.suggestions) {
      const verdict = truthGuard({
        original: item.original,
        suggested: item.suggested,
        resumeText: resumeSearchText(FICTIONAL_RESUME),
        confirmedSkills: [],
      });

      expect(verdict.ok, `${item.id}: ${item.status}`).toBe(item.status === 'ok');
    }
  });
});
