import {
  FICTIONAL_RESUME,
  RESUME_LIMITS,
  type MissingSkill,
  type ResumeData,
} from '@tailex/shared';
import { describe, expect, it } from 'vitest';
import { resumeReducer } from '../review/resume-reducer.ts';
import { findBullet, planSkillAdditions } from './apply-changes.ts';

const missing = (skill: string, groupId: string | null, label: string): MissingSkill => ({
  skill,
  category: 'Tools',
  required: false,
  suggestedGroup: { groupId, label },
});

let counter = 0;
const makeId = (prefix: string): string => `${prefix}-test${String(counter++)}`;

/** Applies a plan with the real reducer, to check the final resume and not just the actions. */
function apply(resume: ResumeData, skills: MissingSkill[]) {
  const plan = planSkillAdditions(resume, skills, makeId);
  return { plan, after: plan.actions.reduce(resumeReducer, resume) };
}

describe('findBullet', () => {
  it('finds experience and project bullets and says where they are', () => {
    expect(findBullet(FICTIONAL_RESUME, 'exp0-b1')).toMatchObject({
      section: 'experience',
      entryId: 'exp0',
      id: 'exp0-b1',
    });
    expect(findBullet(FICTIONAL_RESUME, 'proj0-b0')).toMatchObject({
      section: 'projects',
      entryId: 'proj0',
    });
  });

  it('returns null for an id that does not exist (the bullet was deleted)', () => {
    expect(findBullet(FICTIONAL_RESUME, 'nope')).toBeNull();
    expect(findBullet(FICTIONAL_RESUME, '')).toBeNull();
  });
});

describe('planSkillAdditions', () => {
  it('adds a skill to the suggested group, keeping what is already there', () => {
    const { after, plan } = apply(FICTIONAL_RESUME, [missing('Terraform', 'skills2', 'Tools')]);

    expect(after.skills[2]?.items).toEqual([
      'Docker',
      'Git',
      'PostgreSQL',
      'GitHub Actions',
      'Terraform',
    ]);
    expect(plan).toMatchObject({ added: ['Terraform'], skipped: [] });
  });

  it('does not add a skill the group already has, in any capitalisation', () => {
    const { plan, after } = apply(FICTIONAL_RESUME, [missing('docker', 'skills2', 'Tools')]);

    expect(plan.actions).toEqual([]);
    expect(after).toBe(FICTIONAL_RESUME);
  });

  it('creates a new group when none was suggested, named after the category', () => {
    const { after } = apply(FICTIONAL_RESUME, [missing('Jest', null, 'Testing')]);

    expect(after.skills.at(-1)).toMatchObject({ category: 'Testing', items: ['Jest'] });
    expect(after.skills).toHaveLength(FICTIONAL_RESUME.skills.length + 1);
  });

  it('puts several new skills of one category into ONE new group', () => {
    const { after } = apply(FICTIONAL_RESUME, [
      missing('Jest', null, 'Testing'),
      missing('Cypress', null, 'Testing'),
    ]);

    expect(after.skills).toHaveLength(FICTIONAL_RESUME.skills.length + 1);
    expect(after.skills.at(-1)?.items).toEqual(['Jest', 'Cypress']);
  });

  it('a new group gets an id the schema accepts, and every new id is different', () => {
    const { after } = apply(FICTIONAL_RESUME, [
      missing('Jest', null, 'Testing'),
      missing('Terraform', null, 'Cloud & DevOps'),
    ]);

    const ids = after.skills.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a suggested group that was deleted since becomes a new group', () => {
    const { after } = apply(FICTIONAL_RESUME, [missing('Terraform', 'skills-gone', 'Tools')]);

    expect(after.skills.at(-1)).toMatchObject({ category: 'Tools', items: ['Terraform'] });
  });

  it('adds the same skill only once when it is ticked twice', () => {
    const { plan } = apply(FICTIONAL_RESUME, [
      missing('Terraform', 'skills2', 'Tools'),
      missing('TERRAFORM', 'skills2', 'Tools'),
    ]);

    expect(plan.added).toEqual(['Terraform']);
  });

  it('adds nothing for an empty selection', () => {
    expect(planSkillAdditions(FICTIONAL_RESUME, [], makeId)).toEqual({
      actions: [],
      added: [],
      skipped: [],
    });
  });

  it('respects the size of a group: what does not fit is reported, not lost silently', () => {
    const full: ResumeData = {
      ...FICTIONAL_RESUME,
      skills: [
        {
          id: 'skills0',
          category: 'Tools',
          items: Array.from({ length: RESUME_LIMITS.skillsPerGroup }, (_, i) => `Tool${String(i)}`),
        },
      ],
    };

    const { plan } = apply(full, [missing('Terraform', 'skills0', 'Tools')]);

    expect(plan).toMatchObject({ added: [], skipped: ['Terraform'] });
  });

  it('respects the number of groups: no new group beyond the limit', () => {
    const many: ResumeData = {
      ...FICTIONAL_RESUME,
      skills: Array.from({ length: RESUME_LIMITS.skillGroups }, (_, i) => ({
        id: `skills${String(i)}`,
        category: `Group ${String(i)}`,
        items: [],
      })),
    };

    const { plan } = apply(many, [missing('Jest', null, 'Testing')]);

    expect(plan).toMatchObject({ added: [], skipped: ['Jest'] });
  });

  it('works for a resume with no skills section at all', () => {
    const none: ResumeData = { ...FICTIONAL_RESUME, skills: [] };

    const { after } = apply(none, [missing('Docker', null, 'Cloud & DevOps')]);

    expect(after.skills).toEqual([
      { id: expect.any(String) as string, category: 'Cloud & DevOps', items: ['Docker'] },
    ]);
  });
});
