import { describe, expect, it } from 'vitest';
import { diffWords, type DiffPart } from './word-diff.ts';

/** Joins only the parts of the given kinds back into text. */
const text = (parts: DiffPart[], ...kinds: DiffPart['kind'][]): string =>
  parts
    .filter((part) => kinds.includes(part.kind))
    .map((part) => part.text)
    .join('');

describe('diffWords', () => {
  it('marks nothing as changed for identical text', () => {
    expect(diffWords('Built a dashboard.', 'Built a dashboard.')).toEqual([
      { kind: 'same', text: 'Built a dashboard.' },
    ]);
  });

  it('shows a replaced word as removed then added, keeping the rest', () => {
    const parts = diffWords('Built a React dashboard', 'Developed a React dashboard');

    expect(parts).toEqual([
      { kind: 'removed', text: 'Built' },
      { kind: 'added', text: 'Developed' },
      { kind: 'same', text: ' a React dashboard' },
    ]);
  });

  it('shows added and removed words in the middle', () => {
    const parts = diffWords(
      'Cut latency by 35% using caching',
      'Cut API latency by 35% using Redis caching',
    );

    expect(text(parts, 'added')).toBe('API Redis ');
    expect(text(parts, 'removed')).toBe('');
  });

  it('rebuilds both texts exactly from the parts', () => {
    const before = 'Led a team of engineers, reviewing pull requests daily.';
    const after = 'Managed engineers and reviewed pull requests every day.';

    const parts = diffWords(before, after);

    expect(text(parts, 'same', 'removed')).toBe(before);
    expect(text(parts, 'same', 'added')).toBe(after);
  });

  it('shows a punctuation change as a change (the word with the comma is a different word)', () => {
    const parts = diffWords('Built it, fast', 'Built it fast');

    expect(text(parts, 'removed')).toContain('it,');
    expect(text(parts, 'added')).toContain('it');
  });

  it('handles empty text on either side', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'New bullet')).toEqual([{ kind: 'added', text: 'New bullet' }]);
    expect(diffWords('Old bullet', '')).toEqual([{ kind: 'removed', text: 'Old bullet' }]);
  });

  it('keeps line breaks, tabs and extra spaces exactly', () => {
    const before = 'one  two\tthree\nfour';
    const parts = diffWords(before, before.replace('two', '2'));

    expect(text(parts, 'same', 'removed')).toBe(before);
  });

  it('handles Unicode, emoji and accents as ordinary words', () => {
    const parts = diffWords('Café ☕ team', 'Café ☕ crew');

    expect(text(parts, 'removed')).toBe('team');
    expect(text(parts, 'added')).toBe('crew');
  });

  it('does not freeze on very long text: it falls back to all removed and all added', () => {
    const before = 'word '.repeat(2_000);
    const after = 'term '.repeat(2_000);
    const start = performance.now();

    const parts = diffWords(before, after);

    expect(performance.now() - start).toBeLessThan(500);
    expect(parts).toEqual([
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ]);
  });

  it('is quick on a maximum-size bullet (400 characters)', () => {
    const before =
      'Reduced load time across many pages by lazy loading images and splitting bundles. '
        .repeat(5)
        .slice(0, 400);
    const after =
      'Cut page load time on many pages by lazy loading images and code splitting bundles. '
        .repeat(5)
        .slice(0, 400);
    const start = performance.now();

    diffWords(before, after);

    expect(performance.now() - start).toBeLessThan(100);
  });
});
