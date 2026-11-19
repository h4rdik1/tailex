import { spawnSync } from 'node:child_process';

/**
 * Compile tests need a real pdflatex (in the Docker image and CI). On a laptop without it they
 * are SKIPPED with a visible message, never silently passed. When REQUIRE_PDFLATEX=1 (Docker and
 * CI), a missing pdflatex is an error instead of a skip (docs/DECISIONS.md ADR-023).
 */
export const hasPdflatex: boolean = spawnSync('pdflatex', ['--version']).status === 0;

if (!hasPdflatex) {
  if (process.env.REQUIRE_PDFLATEX === '1') {
    throw new Error('REQUIRE_PDFLATEX=1 but pdflatex was not found on PATH.');
  }
  console.warn(
    '[tailex] pdflatex not found: compile tests are skipped. Run `npm run test:docker`.',
  );
}
