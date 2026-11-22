import { describe, expect, it } from 'vitest';
import { redactContact } from '../src/services/redact/redact-contact.ts';
import { redactText, restorePlaceholders } from '../src/services/redact/redact-text.ts';

/** Fictional only: example.com / example.org, non-working numbers. */
describe('redactText', () => {
  it('replaces emails, links, handles, phones and the known name, remembering each value', () => {
    const text =
      'Mara Fictional shipped it. Mail mara@example.com or call +91 90000 00000, see github.com/mara-example and @mara_codes.';

    const { text: redacted, found } = redactText(text, 'Mara Fictional');

    expect(redacted).toBe(
      '[NAME] shipped it. Mail [EMAIL] or call [PHONE], see [LINK] and [LINK].',
    );
    expect(found).toEqual({
      name: ['Mara Fictional'],
      email: ['mara@example.com'],
      phone: ['+91 90000 00000'],
      link: ['github.com/mara-example', '@mara_codes'],
    });
  });

  it('keeps the values in the order they appear in the text, whatever kind of link they are', () => {
    const { found } = redactText(
      'First @early_bird then https://a.example/x then site.example.org',
      '',
    );

    expect(found.link).toEqual(['@early_bird', 'https://a.example/x', 'site.example.org']);
  });

  it('leaves normal bullet text alone: numbers, versions, tech names', () => {
    const bullet =
      'Cut p95 latency from 900 ms to 350 ms using Node.js, ASP.NET and B.Tech-level SQL in 2023.';

    expect(redactText(bullet, 'Mara Fictional').text).toBe(bullet);
  });

  it('does not take years or short numbers for a phone number', () => {
    expect(redactText('From 2019 2020 2021 to 2023, 40% faster', '').text).toBe(
      'From 2019 2020 2021 to 2023, 40% faster',
    );
  });

  it('does not touch the trailing full stop after a link', () => {
    expect(redactText('Docs at https://docs.example.com/guide.', '').text).toBe('Docs at [LINK].');
  });

  it('finds a name split over a line break, in any case', () => {
    expect(redactText('Thanks, MARA\nfictional!', 'Mara Fictional').text).toBe('Thanks, [NAME]!');
  });

  it('works without a known name, and with empty text', () => {
    expect(redactText('Mara Fictional', '').text).toBe('Mara Fictional');
    expect(redactText('', 'Mara Fictional')).toEqual({
      text: '',
      found: { name: [], email: [], phone: [], link: [] },
    });
  });

  it('does not let a name inside an email be replaced twice', () => {
    const { text, found } = redactText('mara.fictional@example.com', 'Mara Fictional');

    expect(text).toBe('[EMAIL]');
    expect(found.email).toEqual(['mara.fictional@example.com']);
  });

  it('agrees with redactContact on what is personal in a typical line', () => {
    const line = 'Reach me: mara@example.com | +91 90000 00000 | github.com/mara-example';

    expect(redactText(line, '').text).toBe(redactContact(line).redactedText);
  });

  it('handles a very long text without slowing down', () => {
    const start = performance.now();

    redactText('word '.repeat(3_000) + 'a@example.com ' + 'x'.repeat(10_000), 'Mara Fictional');

    expect(performance.now() - start).toBeLessThan(1_000);
  });
});

describe('restorePlaceholders', () => {
  const original = 'Wrote docs at github.com/mara-example for mara@example.com';
  const { text: redacted, found } = redactText(original, '');

  it('puts every value back when the rewrite kept all the placeholders', () => {
    expect(redacted).toBe('Wrote docs at [LINK] for [EMAIL]');

    expect(restorePlaceholders('Authored the docs at [LINK]; contact [EMAIL]', found)).toBe(
      'Authored the docs at github.com/mara-example; contact mara@example.com',
    );
  });

  it('returns the text unchanged when the bullet had no placeholders and the rewrite has none', () => {
    expect(
      restorePlaceholders('Built a dashboard', redactText('Built a dashboard', '').found),
    ).toBe('Built a dashboard');
  });

  it.each([
    ['dropped one', 'Wrote docs at [LINK]'],
    ['added a repeat', 'Wrote [LINK] and [LINK] for [EMAIL]'],
    ['invented a kind', 'Wrote docs at [LINK] for [EMAIL] on [PHONE]'],
    ['dropped all', 'Wrote the docs'],
  ])('refuses when the rewrite %s', (_name, suggested) => {
    expect(restorePlaceholders(suggested, found)).toBeNull();
  });

  it('refuses an invented placeholder when the original had none', () => {
    expect(restorePlaceholders('Mail me at [EMAIL]', redactText('Built it', '').found)).toBeNull();
  });
});
