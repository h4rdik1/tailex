import {
  FICTIONAL_RESUME,
  SAMPLE_TAILOR_RESPONSE,
  type ResumeData,
  type TailorResponse,
} from '@tailex/shared';

/** Sample mode: a fictional resume, loaded with no key and no AI call (docs/SPEC.md). */
export const SAMPLE_RESUME: ResumeData = FICTIONAL_RESUME;

/** What the redacted text of the sample resume looks like, for the "See what's sent" panel. */
export const SAMPLE_REDACTED_PREVIEW = `[NAME]
[EMAIL] | [PHONE] | Pune, India | [LINK] | [LINK]

SKILLS
Languages: TypeScript, JavaScript, SQL, C++
Frameworks: React, Node.js, Express, Redux Toolkit, .NET
Tools: Docker, Git, PostgreSQL, GitHub Actions

EXPERIENCE
Software Engineer, Fictional Payments Pvt Ltd, Pune, India (Jul 2023 to Present)
- Built a React dashboard used by 40 internal support agents to track refund requests.
- Cut API p95 latency from 900 ms to 350 ms by adding PostgreSQL indexes and caching.
- Wrote integration tests with Jest & Supertest, raising coverage to 85% (from 60%).

Software Engineering Intern, Example Logistics, Remote (Jan 2023 to Jun 2023)
- Migrated 12 legacy jQuery pages to React components with TypeScript.
- Automated nightly CSV exports with a Node.js job and cron.

PROJECTS
Budget Buddy (React, Express, SQLite)
- Personal finance tracker with monthly charts and CSV import for 3 bank formats.

EDUCATION
Example Institute of Technology, B.Tech, Computer Engineering, Pune, India (2019 to 2023)`;

/**
 * Sample mode's stand-in for POST /api/tailor: the canned answer after a short pause, so the
 * "Working…" state is visible. No network, no key, no AI.
 */
export function sampleTailor(): Promise<TailorResponse> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(SAMPLE_TAILOR_RESPONSE);
    }, SAMPLE_DELAY_MS);
  });
}

const SAMPLE_DELAY_MS = 600;
