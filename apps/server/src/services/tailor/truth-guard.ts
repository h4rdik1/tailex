/**
 * OWNER-WRITTEN (CLAUDE.md rule 6). Implement this against truth-guard.spec.md; the tests in
 * test/truth-guard.test.ts define "done".
 *
 * Until then this stub FAILS CLOSED: it blocks every suggestion, so nothing the AI wrote can reach
 * the resume. It must never be replaced by something that returns `{ ok: true }` without checking.
 */

export interface TruthGuardInput {
  /** The bullet as the user has it now. */
  original: string;
  /** The AI's rewrite, with the user's own emails/links/phones already put back. */
  suggested: string;
  /** All the resume's text (skills, bullets, summary...), for "is this already somewhere?" checks. */
  resumeText: string;
  /** Skills the user confirmed they really have (canonical names). */
  confirmedSkills: readonly string[];
}

export type TruthGuardResult = { ok: true } | { ok: false; reason: string };

export type TruthGuard = (input: TruthGuardInput) => TruthGuardResult;

export const truthGuard: TruthGuard = () => ({
  ok: false,
  reason: 'The truth check is not finished yet, so no rewrite can be accepted.',
});
