import { RESUME_LIMITS, type MissingSkill, type ResumeData } from '@tailex/shared';
import type { BulletSection, ResumeAction } from '../review/resume-reducer.ts';

/** Where a bullet lives in the resume, found by its id. */
export interface BulletRef {
  section: BulletSection;
  entryId: string;
  id: string;
  text: string;
}

/** The bullet with this id (experience first, then projects), or null if it is gone. */
export function findBullet(resume: ResumeData, bulletId: string): BulletRef | null {
  const sections: [BulletSection, typeof resume.experience | typeof resume.projects][] = [
    ['experience', resume.experience],
    ['projects', resume.projects],
  ];
  for (const [section, entries] of sections) {
    for (const entry of entries) {
      const bullet = entry.bullets.find((candidate) => candidate.id === bulletId);
      if (bullet) return { section, entryId: entry.id, id: bullet.id, text: bullet.text };
    }
  }
  return null;
}

export interface SkillPlan {
  /** Reducer actions that put the skills into the Skills section, in order. */
  actions: ResumeAction[];
  /** The skills that will be added. */
  added: string[];
  /** The skills that did not fit (a full group or too many groups), so the user can place them by hand. */
  skipped: string[];
}

/**
 * How to add skills the user ticked: into the suggested group, or a new group named after the
 * category. Pure (the id maker is passed in), so it is easy to test. A skill already in the group
 * (any capitalisation) is not added twice, and the schema's limits are respected.
 */
export function planSkillAdditions(
  resume: ResumeData,
  skills: readonly MissingSkill[],
  makeId: (prefix: string) => string,
): SkillPlan {
  const actions: ResumeAction[] = [];
  const added: string[] = [];
  const skipped: string[] = [];

  // Skills grouped by destination, in the order they were ticked.
  const destinations = new Map<
    string,
    { groupId: string | null; label: string; names: string[] }
  >();
  for (const { skill, suggestedGroup } of skills) {
    // A suggested group that no longer exists (the user deleted it) becomes a new group.
    const exists = resume.skills.some((group) => group.id === suggestedGroup.groupId);
    const groupId = exists ? suggestedGroup.groupId : null;
    const key = groupId ?? `new:${suggestedGroup.label.toLowerCase()}`;
    const destination = destinations.get(key) ?? {
      groupId,
      label: suggestedGroup.label,
      names: [],
    };
    if (!destination.names.some((name) => name.toLowerCase() === skill.toLowerCase())) {
      destination.names.push(skill);
    }
    destinations.set(key, destination);
  }

  let groupCount = resume.skills.length;
  for (const destination of destinations.values()) {
    const existing = resume.skills.find((group) => group.id === destination.groupId);
    const have = new Set((existing?.items ?? []).map((item) => item.toLowerCase()));
    const fresh = destination.names.filter((name) => !have.has(name.toLowerCase()));
    if (fresh.length === 0) continue;

    if (existing) {
      const room = RESUME_LIMITS.skillsPerGroup - existing.items.length;
      const fits = fresh.slice(0, Math.max(room, 0));
      skipped.push(...fresh.slice(fits.length));
      if (fits.length === 0) continue;
      actions.push({ type: 'setSkillGroup', id: existing.id, items: [...existing.items, ...fits] });
      added.push(...fits);
    } else if (groupCount >= RESUME_LIMITS.skillGroups) {
      skipped.push(...fresh);
    } else {
      const id = makeId('skills');
      const fits = fresh.slice(0, RESUME_LIMITS.skillsPerGroup);
      skipped.push(...fresh.slice(fits.length));
      actions.push({ type: 'addSkillGroup', id });
      actions.push({ type: 'setSkillGroup', id, category: destination.label, items: fits });
      added.push(...fits);
      groupCount += 1;
    }
  }
  return { actions, added, skipped };
}
