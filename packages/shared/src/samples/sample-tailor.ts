import type { TailorResponse } from '../tailor.ts';

/**
 * Sample mode for the Tailor step: a FICTIONAL job description and a pre-made answer, so the
 * whole flow works with no key and no AI call (docs/SPEC.md §9). Fictional company, nobody real.
 * The suggestions are written for FICTIONAL_RESUME: their `original` text is its exact bullets.
 * A test (server) checks the statuses here against the real truth guard once it is written.
 */
export const SAMPLE_JD = `Frontend Engineer, Example Corp (fictional)

About us
We build tools for support teams at Example Corp.

Requirements:
- 2+ years of experience with React and TypeScript
- Experience with Docker and CI/CD pipelines
- Infrastructure as code with Terraform
- You write unit tests (Jest)

Nice to have:
- Kubernetes
- GraphQL

What you'll do
Build and ship dashboards, review code, and improve performance.`;

export const SAMPLE_TAILOR_RESPONSE: TailorResponse = {
  suggestions: [
    {
      id: 'exp0-b0',
      original:
        'Built a React dashboard used by 40 internal support agents to track refund requests.',
      suggested:
        'Developed a React and TypeScript dashboard used by 40 internal support agents to track refund requests.',
      reason: 'Uses the job description’s wording for the stack.',
      status: 'blocked',
      blockedReason: 'Adds a skill that is not in this bullet: TypeScript.',
    },
    {
      id: 'exp0-b1',
      original:
        'Cut API p95 latency from 900 ms to 350 ms by adding PostgreSQL indexes and caching.',
      suggested:
        'Reduced API p95 latency from 900 ms to 350 ms by adding PostgreSQL indexes and caching.',
      reason: 'The job description stresses performance improvements.',
      status: 'ok',
    },
    {
      id: 'exp0-b2',
      original:
        'Wrote integration tests with Jest & Supertest, raising coverage to 85% (from 60%).',
      suggested:
        'Wrote integration tests with Jest & Supertest, raising coverage to 95% (from 60%).',
      reason: 'Highlights testing, which the job description asks for.',
      status: 'blocked',
      blockedReason: 'Adds a number that is not in this bullet: 95.',
    },
    {
      id: 'exp1-b0',
      original: 'Migrated 12 legacy jQuery pages to React components with TypeScript.',
      suggested:
        'Modernized 12 legacy jQuery pages by migrating them to React components with TypeScript.',
      reason: 'Frames the migration as modernization, a term the job description uses.',
      status: 'ok',
    },
  ],
  bulletsConsidered: 6,
  bulletsTotal: 6,
  ignored: 0,
};
