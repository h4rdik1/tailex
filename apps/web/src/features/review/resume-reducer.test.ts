import { FICTIONAL_RESUME, ItemIdSchema } from '@tailex/shared';
import { describe, expect, it } from 'vitest';
import { EMPTY_RESUME, moveItem, newId, resumeReducer } from './resume-reducer.ts';

const start = FICTIONAL_RESUME;

describe('resumeReducer', () => {
  it('replace swaps in a whole new resume', () => {
    expect(resumeReducer(EMPTY_RESUME, { type: 'replace', resume: start })).toBe(start);
  });

  it('sets and clears the optional headline and summary', () => {
    const withBoth = resumeReducer(
      resumeReducer(start, { type: 'setHeadline', value: 'Master Tailor' }),
      { type: 'setSummary', value: 'Skilled tailor.' },
    );

    expect(withBoth).toMatchObject({ headline: 'Master Tailor', summary: 'Skilled tailor.' });
    expect(withBoth.experience).toBe(start.experience);

    const cleared = resumeReducer(withBoth, { type: 'setSummary', value: '' });
    expect(cleared.summary).toBe('');
    expect(cleared.headline).toBe('Master Tailor');
  });

  it('an empty resume has no headline or summary', () => {
    expect(EMPTY_RESUME).toMatchObject({ headline: '', summary: '' });
  });

  it('edits a contact field without touching anything else', () => {
    const next = resumeReducer(start, { type: 'setContact', field: 'name', value: 'A. Test' });

    expect(next.contact.name).toBe('A. Test');
    expect(next.contact.email).toBe(start.contact.email);
    expect(next.experience).toBe(start.experience); // untouched parts are reused, not copied
  });

  it('never mutates the previous state', () => {
    const before = structuredClone(start);
    resumeReducer(start, { type: 'setExperience', id: 'exp0', field: 'title', value: 'Lead' });
    resumeReducer(start, {
      type: 'removeBullet',
      section: 'experience',
      entryId: 'exp0',
      id: 'exp0-b0',
    });

    expect(start).toEqual(before);
  });

  it('adds, edits and removes a link', () => {
    let next = resumeReducer(start, { type: 'addLink', id: 'link-new' });
    next = resumeReducer(next, { type: 'setLink', id: 'link-new', field: 'label', value: 'site' });

    expect(next.contact.links.at(-1)).toEqual({ id: 'link-new', label: 'site', url: 'https://' });

    next = resumeReducer(next, { type: 'removeItem', section: 'links', id: 'link-new' });
    expect(next.contact.links).toEqual(start.contact.links);
  });

  it('edits skill group category and items', () => {
    const next = resumeReducer(start, {
      type: 'setSkillGroup',
      id: 'skills0',
      items: ['Go', 'Rust'],
    });

    expect(next.skills[0]).toEqual({ id: 'skills0', category: 'Languages', items: ['Go', 'Rust'] });
  });

  it('adds an empty entry to each section', () => {
    let next = resumeReducer(EMPTY_RESUME, { type: 'addEntry', section: 'experience', id: 'e1' });
    next = resumeReducer(next, { type: 'addEntry', section: 'projects', id: 'p1' });
    next = resumeReducer(next, { type: 'addEntry', section: 'education', id: 'ed1' });

    expect(next.experience).toHaveLength(1);
    expect(next.projects).toEqual([{ id: 'p1', name: '', tech: [], bullets: [] }]);
    expect(next.education[0]?.school).toBe('');
  });

  it('removes an entry by id', () => {
    const next = resumeReducer(start, { type: 'removeItem', section: 'experience', id: 'exp1' });

    expect(next.experience.map((e) => e.id)).toEqual(['exp0']);
  });

  it('adds, edits and removes a bullet in a project', () => {
    let next = resumeReducer(start, {
      type: 'addBullet',
      section: 'projects',
      entryId: 'proj0',
      id: 'b-new',
    });
    next = resumeReducer(next, {
      type: 'setBullet',
      section: 'projects',
      entryId: 'proj0',
      id: 'b-new',
      text: 'Shipped it.',
    });

    expect(next.projects[0]?.bullets.at(-1)).toEqual({ id: 'b-new', text: 'Shipped it.' });

    next = resumeReducer(next, {
      type: 'removeBullet',
      section: 'projects',
      entryId: 'proj0',
      id: 'b-new',
    });
    expect(next.projects[0]?.bullets).toEqual(start.projects[0]?.bullets);
  });

  it('moves a bullet up', () => {
    const next = resumeReducer(start, {
      type: 'moveBullet',
      section: 'experience',
      entryId: 'exp0',
      id: 'exp0-b1',
      by: -1,
    });

    expect(next.experience[0]?.bullets.map((b) => b.id)).toEqual(['exp0-b1', 'exp0-b0', 'exp0-b2']);
  });
});

describe('moveItem', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('does nothing past either end or for an unknown id', () => {
    expect(moveItem(list, 'a', -1)).toBe(list);
    expect(moveItem(list, 'c', 1)).toBe(list);
    expect(moveItem(list, 'zzz', 1)).toBe(list);
  });

  it('moves down', () => {
    expect(moveItem(list, 'a', 1).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('newId', () => {
  it('makes ids the server accepts', () => {
    expect(ItemIdSchema.safeParse(newId('exp')).success).toBe(true);
    expect(newId('exp')).not.toBe(newId('exp'));
  });
});
