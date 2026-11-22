import type { Bullet, Contact, Education, Experience, ResumeData } from '@tailex/shared';

/**
 * Every edit the review form can make, as plain data. The reducer is a pure function
 * (same state + same action → same result), so it is easy to test without a browser.
 * New ids are created by the caller (see newId) and passed in, which keeps the reducer pure.
 */
export type ContactField = Exclude<keyof Contact, 'links'>;
export type ExperienceField = Exclude<keyof Experience, 'id' | 'bullets'>;
export type EducationField = Exclude<keyof Education, 'id'>;
export type EntrySection = 'experience' | 'projects' | 'education';
export type BulletSection = 'experience' | 'projects';

export type ResumeAction =
  | { type: 'replace'; resume: ResumeData }
  | { type: 'setContact'; field: ContactField; value: string }
  | { type: 'setHeadline'; value: string }
  | { type: 'setSummary'; value: string }
  | { type: 'setLink'; id: string; field: 'label' | 'url'; value: string }
  | { type: 'addLink'; id: string }
  | { type: 'setSkillGroup'; id: string; category?: string; items?: string[] }
  | { type: 'addSkillGroup'; id: string }
  | { type: 'setExperience'; id: string; field: ExperienceField; value: string }
  | { type: 'setProject'; id: string; name?: string; tech?: string[] }
  | { type: 'setEducation'; id: string; field: EducationField; value: string }
  | { type: 'addEntry'; section: EntrySection; id: string }
  | { type: 'removeItem'; section: EntrySection | 'skills' | 'links'; id: string }
  | { type: 'addBullet'; section: BulletSection; entryId: string; id: string }
  | { type: 'setBullet'; section: BulletSection; entryId: string; id: string; text: string }
  | { type: 'removeBullet'; section: BulletSection; entryId: string; id: string }
  | { type: 'moveBullet'; section: BulletSection; entryId: string; id: string; by: -1 | 1 };

export const EMPTY_RESUME: ResumeData = {
  contact: { name: '', email: '', phone: '', location: '', links: [] },
  headline: '',
  summary: '',
  skills: [],
  experience: [],
  projects: [],
  education: [],
};

/** A short id that matches ItemIdSchema (lowercase letters, digits, dashes). */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function resumeReducer(state: ResumeData, action: ResumeAction): ResumeData {
  switch (action.type) {
    case 'replace':
      return action.resume;

    case 'setContact':
      return { ...state, contact: { ...state.contact, [action.field]: action.value } };

    case 'setHeadline':
      return { ...state, headline: action.value };

    case 'setSummary':
      return { ...state, summary: action.value };

    case 'setLink':
      return {
        ...state,
        contact: {
          ...state.contact,
          links: updateById(state.contact.links, action.id, (link) => ({
            ...link,
            [action.field]: action.value,
          })),
        },
      };

    case 'addLink':
      return {
        ...state,
        contact: {
          ...state.contact,
          links: [...state.contact.links, { id: action.id, label: '', url: 'https://' }],
        },
      };

    case 'setSkillGroup':
      return {
        ...state,
        skills: updateById(state.skills, action.id, (group) => ({
          ...group,
          category: action.category ?? group.category,
          items: action.items ?? group.items,
        })),
      };

    case 'addSkillGroup':
      return { ...state, skills: [...state.skills, { id: action.id, category: '', items: [] }] };

    case 'setExperience':
      return {
        ...state,
        experience: updateById(state.experience, action.id, (entry) => ({
          ...entry,
          [action.field]: action.value,
        })),
      };

    case 'setProject':
      return {
        ...state,
        projects: updateById(state.projects, action.id, (project) => ({
          ...project,
          name: action.name ?? project.name,
          tech: action.tech ?? project.tech,
        })),
      };

    case 'setEducation':
      return {
        ...state,
        education: updateById(state.education, action.id, (entry) => ({
          ...entry,
          [action.field]: action.value,
        })),
      };

    case 'addEntry':
      return addEntry(state, action.section, action.id);

    case 'removeItem':
      return removeItem(state, action.section, action.id);

    case 'addBullet':
      return updateBullets(state, action.section, action.entryId, (bullets) => [
        ...bullets,
        { id: action.id, text: '' },
      ]);

    case 'setBullet':
      return updateBullets(state, action.section, action.entryId, (bullets) =>
        updateById(bullets, action.id, (bullet) => ({ ...bullet, text: action.text })),
      );

    case 'removeBullet':
      return updateBullets(state, action.section, action.entryId, (bullets) =>
        bullets.filter((bullet) => bullet.id !== action.id),
      );

    case 'moveBullet':
      return updateBullets(state, action.section, action.entryId, (bullets) =>
        moveItem(bullets, action.id, action.by),
      );
  }
}

function updateById<T extends { id: string }>(list: T[], id: string, change: (item: T) => T): T[] {
  return list.map((item) => (item.id === id ? change(item) : item));
}

function withoutId<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((item) => item.id !== id);
}

/** Swaps an item with its neighbour. Moving past either end does nothing. */
export function moveItem<T extends { id: string }>(list: T[], id: string, by: -1 | 1): T[] {
  const from = list.findIndex((item) => item.id === id);
  const to = from + by;
  if (from === -1 || to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[from], copy[to]] = [copy[to] as T, copy[from] as T];
  return copy;
}

function addEntry(state: ResumeData, section: EntrySection, id: string): ResumeData {
  switch (section) {
    case 'experience':
      return {
        ...state,
        experience: [
          ...state.experience,
          { id, title: '', company: '', location: '', startDate: '', endDate: '', bullets: [] },
        ],
      };
    case 'projects':
      return { ...state, projects: [...state.projects, { id, name: '', tech: [], bullets: [] }] };
    case 'education':
      return {
        ...state,
        education: [
          ...state.education,
          { id, school: '', degree: '', location: '', startYear: '', endYear: '' },
        ],
      };
  }
}

function removeItem(
  state: ResumeData,
  section: EntrySection | 'skills' | 'links',
  id: string,
): ResumeData {
  switch (section) {
    case 'links':
      return { ...state, contact: { ...state.contact, links: withoutId(state.contact.links, id) } };
    case 'skills':
      return { ...state, skills: withoutId(state.skills, id) };
    case 'experience':
      return { ...state, experience: withoutId(state.experience, id) };
    case 'projects':
      return { ...state, projects: withoutId(state.projects, id) };
    case 'education':
      return { ...state, education: withoutId(state.education, id) };
  }
}

function updateBullets(
  state: ResumeData,
  section: BulletSection,
  entryId: string,
  change: (bullets: Bullet[]) => Bullet[],
): ResumeData {
  if (section === 'experience') {
    return {
      ...state,
      experience: updateById(state.experience, entryId, (entry) => ({
        ...entry,
        bullets: change(entry.bullets),
      })),
    };
  }
  return {
    ...state,
    projects: updateById(state.projects, entryId, (project) => ({
      ...project,
      bullets: change(project.bullets),
    })),
  };
}
