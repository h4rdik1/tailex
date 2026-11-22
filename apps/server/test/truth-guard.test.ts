import { describe, expect, it } from 'vitest';
import { truthGuard } from '../src/services/tailor/truth-guard.ts';

/**
 * These tests define "done" for the owner-written truth guard (truth-guard.spec.md).
 * They fail on purpose until it is written: the stub blocks everything. Every "blocked" test
 * checks the reason, so the stub cannot pass one by accident. Fictional people and companies only.
 */
const ORIGINAL =
  'Built a React dashboard used by 40 internal support agents to track refund requests.';

interface Options {
  resumeText?: string;
  confirmed?: string[];
}

function check(original: string, suggested: string, options: Options = {}) {
  return truthGuard({
    original,
    suggested,
    resumeText: options.resumeText ?? original,
    confirmedSkills: options.confirmed ?? [],
  });
}

function expectOk(original: string, suggested: string, options: Options = {}): void {
  expect(check(original, suggested, options)).toEqual({ ok: true });
}

function expectBlocked(
  original: string,
  suggested: string,
  reasonPart: string | RegExp,
  options: Options = {},
): void {
  const result = check(original, suggested, options);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toMatch(reasonPart);
}

describe('truthGuard: what is allowed (rephrasing is not lying)', () => {
  it('accepts an unchanged bullet', () => {
    expectOk(ORIGINAL, ORIGINAL);
  });

  it('accepts new verbs and reworded sentences with the same facts', () => {
    expectOk(
      ORIGINAL,
      'Developed a React dashboard adopted by 40 internal support agents to monitor refund requests.',
    );
  });

  it('accepts a shorter bullet that drops details', () => {
    expectOk(ORIGINAL, 'Built a React dashboard for support agents.');
  });

  it("accepts the job description's alias of a skill the bullet already has", () => {
    expectOk('Stored orders in Postgres and Node.', 'Stored orders in PostgreSQL and Node.js.');
    expectOk('Designed REST endpoints for the app.', 'Designed RESTful APIs for the app.');
  });

  it('ignores case, curly quotes, dashes and hyphens', () => {
    expectOk(
      "Led the front-end team's NODE.JS migration.",
      'Led the front end team’s node.js migration.',
    );
  });

  it('accepts removing a number or a name', () => {
    expectOk('Cut latency by 35% at Example Logistics.', 'Cut latency substantially.');
  });
});

describe('R1: no new skill or tool', () => {
  it.each([
    [
      'a framework',
      ORIGINAL,
      'Built a React and Redux dashboard used by 40 internal support agents to track refund requests.',
      'Redux',
    ],
    [
      'a tool',
      ORIGINAL,
      'Built a React dashboard with Docker for 40 internal support agents to track refund requests.',
      'Docker',
    ],
    ['a language', 'Wrote scripts to clean data.', 'Wrote Python scripts to clean data.', 'Python'],
    ['a cloud service', 'Deployed the API.', 'Deployed the API on AWS.', 'AWS'],
    [
      'an ambiguous name',
      'Wrote the data layer.',
      'Wrote the data layer in Go, Python and Rust.',
      'Go',
    ],
  ])('blocks %s that is not in the bullet', (_name, original, suggested, skill) => {
    expectBlocked(original, suggested, new RegExp(`skill.*${skill}`, 'i'));
  });

  it('blocks a skill that is listed elsewhere on the resume but not in this bullet (decision D1)', () => {
    expectBlocked(
      'Maintained the build pipeline.',
      'Maintained the build pipeline with Docker.',
      /skill.*Docker/i,
      { resumeText: 'Skills: Docker, Git. Maintained the build pipeline.' },
    );
  });

  it('allows a skill the user confirmed, in any capitalisation', () => {
    expectOk('Maintained the build pipeline.', 'Maintained the build pipeline with Kubernetes.', {
      confirmed: ['Kubernetes'],
    });
    expectOk('Wrote the server.', 'Wrote the server in node.js.', { confirmed: ['Node.js'] });
  });

  it('a confirmed skill does not unlock a different one', () => {
    expectBlocked(
      'Maintained the build pipeline.',
      'Maintained the build pipeline with Kubernetes and Terraform.',
      /skill.*Terraform/i,
      { confirmed: ['Kubernetes'] },
    );
  });

  it('does not mistake ordinary words for skills', () => {
    expectOk('Helped the team go to market faster.', 'Helped the team reach the market faster.');
    expectOk('Worked on R&D projects.', 'Contributed to R&D projects.');
  });

  it('does not treat C as C++ or Java as JavaScript', () => {
    expectBlocked('Wrote drivers in C.', 'Wrote drivers in C++.', /skill.*C\+\+/i);
    expectBlocked('Built a Java service.', 'Built a JavaScript service.', /skill.*JavaScript/i);
  });
});

describe('R2: no new number or percentage', () => {
  it.each([
    ['a number', ORIGINAL, ORIGINAL.replace('40', '400'), '400'],
    ['a percentage', 'Cut latency by 35%.', 'Cut latency by 45%.', '45'],
    ['a new percentage', 'Improved page speed.', 'Improved page speed by 20%.', '20'],
    ['a new count', 'Led a team of engineers.', 'Led a team of 8 engineers.', '8'],
    ['a year', 'Joined the company.', 'Joined the company in 2019.', '2019'],
    ['a number with a unit', 'Reduced response time.', 'Reduced response time to 200 ms.', '200'],
  ])('blocks %s', (_name, original, suggested, number) => {
    expectBlocked(original, suggested, new RegExp(`number.*${number}`, 'i'));
  });

  it('allows the same number written differently', () => {
    expectOk('Served 1,000 users.', 'Served 1000 users.');
    expectOk('Served 1000 users.', 'Served 1,000 users.');
    expectOk('Saved $5M a year.', 'Saved 5 million dollars a year.');
    expectOk('Handled 1.5k requests.', 'Handled 1,500 requests.');
    expectOk('Cut errors by 40%.', 'Cut errors by 40 percent.');
  });

  it('treats spelled-out numbers as numbers (decision D3)', () => {
    expectOk('Mentored 10 interns.', 'Mentored ten interns.');
    expectBlocked('Mentored interns.', 'Mentored ten interns.', /number.*ten/i);
  });

  it('keeps every number the bullet has, including units', () => {
    const original = 'Cut API p95 latency from 900 ms to 350 ms.';

    expectOk(original, 'Reduced API p95 latency from 900 ms to 350 ms.');
    expectBlocked(original, 'Reduced API p95 latency from 900 ms to 250 ms.', /number.*250/i);
  });

  it('a number that is elsewhere on the resume is still new for this bullet (decision D1)', () => {
    expectBlocked('Improved page speed.', 'Improved page speed by 85%.', /number.*85/i, {
      resumeText: 'Wrote tests, raising coverage to 85%. Improved page speed.',
    });
  });

  it('does not count digits inside names as numbers', () => {
    expectOk('Stored files in S3 and ran on EC2.', 'Stored files in S3 and ran workloads on EC2.');
    expectOk('Tuned p95 latency.', 'Improved p95 latency.');
    expectOk('Built HTML5 pages.', 'Created HTML5 pages.');
  });

  it('a percent is not the same as a plain number', () => {
    expectBlocked('Handled 40 requests.', 'Handled 40% of requests.', /number.*40/i);
  });
});

describe('R3: no new name (employer, product, client, school, acronym)', () => {
  it.each([
    ['an employer', 'Built the checkout flow.', 'Built the checkout flow at Stripe.', 'Stripe'],
    [
      'a client',
      'Delivered the reporting module.',
      'Delivered the reporting module for Acme Corp.',
      'Acme',
    ],
    [
      'a product',
      'Improved the search page.',
      'Improved the search page for Google Search.',
      'Google',
    ],
    ['an acronym', 'Improved the search page.', 'Improved the search page KPIs.', 'KPIs'],
    ['a mixed-case term', 'Sold plans to customers.', 'Sold SaaS plans to customers.', 'SaaS'],
  ])('blocks %s', (_name, original, suggested, name) => {
    expectBlocked(original, suggested, new RegExp(`name.*${name}`, 'i'));
  });

  it('blocks an employer taken from another job on the resume (decision D1)', () => {
    expectBlocked(
      'Led the migration.',
      'Led the migration for Example Logistics.',
      /name.*Example/i,
      {
        resumeText: 'Software Engineer at Example Logistics. Led the migration.',
      },
    );
  });

  it('allows names the bullet already has, in any case', () => {
    expectOk(
      'Worked with the Pune team on Budget Buddy.',
      'Partnered with the PUNE team on budget buddy.',
    );
  });

  it('allows a capitalised first word of a sentence, such as a new verb', () => {
    expectOk('Wrote the docs.', 'Drafted the docs. Reviewed pages.');
    expectOk('Wrote the docs.', 'Authored the docs.');
  });

  it("does not block ordinary capitalised skills (they are R1's job, and confirmed ones are fine)", () => {
    expectOk('Wrote the server.', 'Wrote the Kubernetes server.', { confirmed: ['Kubernetes'] });
  });
});

describe('R4: no new link, email or phone', () => {
  it.each([
    ['a link', 'Wrote the docs.', 'Wrote the docs at https://docs.example.com.'],
    ['a bare domain', 'Wrote the docs.', 'Wrote the docs at docs.example.org/guide.'],
    ['an email', 'Wrote the docs.', 'Wrote the docs; mail docs@example.com.'],
    ['a phone number', 'Wrote the docs.', 'Wrote the docs; call +91 90000 00000.'],
  ])('blocks %s', (_name, original, suggested) => {
    expectBlocked(original, suggested, /link, email or phone/i);
  });

  it("allows the user's own link when it is already in the bullet", () => {
    expectOk('Docs at github.com/mara-example.', 'Published the docs at github.com/mara-example.');
  });
});

describe('R7: does not raise the role (assisted -> led)', () => {
  it.each([
    ['Assisted the team that built the API.', 'Led the team that built the API.', 'assisted → led'],
    ['Helped ship the release.', 'Built the release.', 'helped → built'],
    ['Built the report.', 'Managed the report.', 'built → managed'],
  ])('blocks %j -> %j', (original, suggested, change) => {
    expectBlocked(original, suggested, new RegExp(`role.*${change}`, 'i'));
  });

  it('allows the same level, a lower level, and verbs it does not know', () => {
    expectOk('Built the report.', 'Developed the report.');
    expectOk('Led the migration.', 'Helped with the migration.');
    expectOk('Analysed the logs.', 'Led the logs.'); // original verb unknown: not judged
  });
});

describe('R5: not much longer than the original', () => {
  it('blocks a rewrite more than 1.5x as long (plus slack)', () => {
    const original =
      'Built a dashboard for support agents to track refunds and resolve cases faster.';
    const longer = `${original} ${original}`;

    expectBlocked(original, longer, /longer/i);
  });

  it('allows a modest increase and some slack for very short bullets', () => {
    expectOk('Built the API.', 'Built and launched the API.');
    expectOk(ORIGINAL, `${ORIGINAL.slice(0, -1)} for the whole team.`);
  });
});

describe('R6: not empty', () => {
  it.each([[''], ['   '], ['\n\t']])('blocks an empty rewrite %j', (suggested) => {
    expectBlocked(ORIGINAL, suggested, /empty/i);
  });
});

describe('truthGuard: reasons and robustness', () => {
  it('gives the first reason in the spec order when several rules fail', () => {
    expectBlocked(
      'Built the API.',
      'Built the API with Docker, 400% faster, at Stripe.',
      /skill.*Docker/i,
    );
  });

  it('is deterministic and does not change its inputs', () => {
    const input = {
      original: ORIGINAL,
      suggested: ORIGINAL.replace('40', '41'),
      resumeText: ORIGINAL,
      confirmedSkills: ['Docker'] as const,
    };
    const before = JSON.stringify(input);

    const first = truthGuard(input);
    const second = truthGuard(input);

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('never throws on odd input: emoji, empty original, huge text, control characters', () => {
    expect(() =>
      truthGuard({ original: '', suggested: 'x', resumeText: '', confirmedSkills: [] }),
    ).not.toThrow();
    expect(() =>
      truthGuard({
        original: 'ok \u0000 ​',
        suggested: '\u{1F680} ok',
        resumeText: '',
        confirmedSkills: [],
      }),
    ).not.toThrow();
    expect(() =>
      truthGuard({
        original: 'a '.repeat(5_000),
        suggested: 'a '.repeat(5_000),
        resumeText: '',
        confirmedSkills: [],
      }),
    ).not.toThrow();
  });

  it('every blocked result has a short reason in plain words', () => {
    const result = check('Built the API.', 'Built the API with Docker.');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Docker/); // names the culprit, so the user knows what to fix
      expect(result.reason.length).toBeGreaterThan(10);
      expect(result.reason.length).toBeLessThan(150);
    }
  });
});
