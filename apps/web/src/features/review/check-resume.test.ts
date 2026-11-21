import { FICTIONAL_RESUME, RESUME_LIMITS } from '@tailex/shared';
import { describe, expect, it } from 'vitest';
import { describePath, findPlaceholders, findProblems } from './check-resume.ts';

describe('findProblems', () => {
  it('finds nothing wrong with the sample resume', () => {
    expect(findProblems(FICTIONAL_RESUME)).toEqual([]);
  });

  it('reports a bad link and a too-long bullet with readable locations', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.contact.links[0] = { id: 'link0', label: 'x', url: 'javascript:alert(1)' };
    const firstJob = resume.experience[0];
    if (!firstJob?.bullets[1]) throw new Error('fixture changed');
    firstJob.bullets[1].text = 'x'.repeat(RESUME_LIMITS.bullet + 1);

    const where = findProblems(resume).map((p) => p.where);

    expect(where).toContain('Contact › Link 1 › url');
    expect(where).toContain('Experience 1 › Bullet 2 › text');
  });
});

describe('findPlaceholders', () => {
  it('finds redaction placeholders left in fields, but not in ids', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    const project = resume.projects[0];
    if (!project?.bullets[0]) throw new Error('fixture changed');
    project.bullets[0].text = 'Live demo at [LINK].';
    resume.contact.location = '[PHONE]';

    expect(findPlaceholders(resume)).toEqual(['Contact › location', 'Project 1 › Bullet 1 › text']);
  });

  it('finds nothing in the sample resume', () => {
    expect(findPlaceholders(FICTIONAL_RESUME)).toEqual([]);
  });
});

describe('describePath', () => {
  it('numbers list items from 1 and splits camelCase', () => {
    expect(describePath(['education', 0, 'startYear'])).toBe('Education 1 › start year');
    expect(describePath(['skills', 1, 'items', 3])).toBe('Skill group 2 › Skill 4');
  });
});
