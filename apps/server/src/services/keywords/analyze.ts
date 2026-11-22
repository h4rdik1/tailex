import type { KeywordsResponse, MissingSkill, ResumeData, SuggestedGroup } from '@tailex/shared';
import { scanSkills } from './match.ts';
import { requiredSkills } from './required.ts';

/**
 * Compares a job description with a resume, entirely in code (docs/DECISIONS.md ADR-009, ADR-039):
 * the same input always gives the same answer, and no LLM is involved, so no key is needed.
 */

/** The resume text the job description is compared with: everything the reader would see. */
export function resumeSearchText(resume: ResumeData): string {
  return [
    resume.headline,
    resume.summary,
    ...resume.skills.map((group) => `${group.category}: ${group.items.join(', ')}`),
    ...resume.experience.flatMap((job) => [job.title, ...job.bullets.map((b) => b.text)]),
    ...resume.projects.flatMap((project) => [
      project.name,
      project.tech.join(', '),
      ...project.bullets.map((b) => b.text),
    ]),
  ]
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/** Only the places where a person LISTS skills: the Skills section and each project's tech. */
function listedSkillsText(resume: ResumeData): string {
  return [
    ...resume.skills.map((group) => `${group.category}: ${group.items.join(', ')}`),
    ...resume.projects.map((project) => project.tech.join(', ')),
  ].join('\n');
}

/** Words that tell us a resume's skills group is the right home for a category of skill. */
const GROUP_HINTS: Record<string, string[]> = {
  Languages: ['language', 'languages', 'programming'],
  Frontend: ['frontend', 'front end', 'ui', 'web'],
  Backend: ['backend', 'back end', 'server', 'frameworks', 'framework'],
  Databases: ['database', 'databases', 'data', 'db'],
  'Cloud & DevOps': ['cloud', 'devops', 'infrastructure', 'deployment', 'infra'],
  Testing: ['testing', 'test', 'tests', 'qa'],
  Tools: ['tools', 'tool', 'tooling', 'other'],
  'Data & AI': ['data science', 'ai', 'ml', 'machine learning', 'analytics', 'data'],
  Concepts: ['concepts', 'practices', 'methodologies', 'methods'],
};

const padded = (text: string): string =>
  ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

/** Where a confirmed skill of this category should go: a matching group, the only group, or a new one. */
export function suggestGroup(category: string, resume: ResumeData): SuggestedGroup {
  const groups = resume.skills;
  const exact = groups.find((group) => padded(group.category) === padded(category));
  if (exact) return { groupId: exact.id, label: exact.category };

  const hints = GROUP_HINTS[category] ?? [];
  const byHint = groups.find((group) =>
    hints.some((hint) => padded(group.category).includes(padded(hint))),
  );
  if (byHint) return { groupId: byHint.id, label: byHint.category };

  // A resume with one plain group (e.g. "Skills") keeps all its skills together.
  const only = groups.length === 1 ? groups[0] : undefined;
  if (only) return { groupId: only.id, label: only.category };
  return { groupId: null, label: category };
}

export function analyze(resume: ResumeData, jd: string): KeywordsResponse {
  const jdScan = scanSkills(jd);
  const required = requiredSkills(jdScan);

  const jdSkills = new Map<string, string>(); // canonical → category, in order of appearance
  for (const hit of jdScan.hits)
    if (!jdSkills.has(hit.canonical)) jdSkills.set(hit.canonical, hit.category);

  const inResume = new Set(scanSkills(resumeSearchText(resume)).hits.map((hit) => hit.canonical));
  const listed = [
    ...new Set(scanSkills(listedSkillsText(resume)).hits.map((hit) => hit.canonical)),
  ];

  const matched: string[] = [];
  const missing: MissingSkill[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;
  for (const [skill, category] of jdSkills) {
    const isRequired = required.get(skill) ?? false;
    const weight = isRequired ? 2 : 1;
    totalWeight += weight;
    if (inResume.has(skill)) {
      matched.push(skill);
      matchedWeight += weight;
    } else {
      missing.push({
        skill,
        category,
        required: isRequired,
        suggestedGroup: suggestGroup(category, resume),
      });
    }
  }

  return {
    matched,
    // Required first, then in the order the job description mentions them.
    missing: [...missing.filter((m) => m.required), ...missing.filter((m) => !m.required)],
    extra: listed.filter((skill) => !jdSkills.has(skill)),
    score: totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100),
    jdSkillCount: jdSkills.size,
  };
}
