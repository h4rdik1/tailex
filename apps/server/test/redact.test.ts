import { describe, expect, it } from 'vitest';
import { guessName, redactContact } from '../src/services/redact/redact-contact.ts';
import { FIXTURE_RESUMES } from './fixtures/resumes.ts';

describe('redactContact: emails', () => {
  it('replaces every email and keeps the first as the contact email', () => {
    const { redactedText, contact } = redactContact('a.b+tag@example.com and c_d@sub.example.org');

    expect(redactedText).toBe('[EMAIL] and [EMAIL]');
    expect(contact.email).toBe('a.b+tag@example.com');
  });
});

describe('redactContact: phones', () => {
  it.each([
    '+91 90000 00000',
    '+91-90000-00000',
    '(555) 010-0199',
    '+1-555-010-0123',
    '555.010.0123',
    '9000000000',
  ])('redacts %s', (phone) => {
    const { redactedText, contact } = redactContact(`Call ${phone} today`);

    expect(redactedText).toBe('Call [PHONE] today');
    expect(contact.phone).toBe(phone);
  });

  it.each(['2019 – 2023', '2019-2023', '2021 2022 2023', 'Cut cost by 22%', 'Team of 12'])(
    'leaves %s alone (years and small numbers are not phones)',
    (text) => {
      expect(redactContact(text).redactedText).toBe(text);
    },
  );
});

describe('redactContact: links and handles', () => {
  it.each([
    ['https://asha.example.org/', 'https://asha.example.org/'],
    ['www.linkedin.com/in/rohan-example', 'https://www.linkedin.com/in/rohan-example'],
    ['github.com/asha-example', 'https://github.com/asha-example'],
  ])('redacts %s', (link, expectedUrl) => {
    const { redactedText, contact } = redactContact(`See ${link} please`);

    expect(redactedText).toBe('See [LINK] please');
    expect(contact.links.map((l) => l.url)).toEqual([expectedUrl]);
  });

  it('keeps sentence punctuation after a link', () => {
    expect(redactContact('Visit https://a.example.com/x.').redactedText).toBe('Visit [LINK].');
  });

  it('redacts @handles but not the @ inside an email', () => {
    const { redactedText } = redactContact('@rohan_codes, me@example.com');

    expect(redactedText).toBe('[LINK], [EMAIL]');
  });

  it('does not put unsafe URLs into the contact links', () => {
    const { redactedText, contact } = redactContact('https://example.com/a{b}\\c');

    expect(redactedText).not.toContain('example.com');
    expect(contact.links).toEqual([]);
  });
});

describe('guessName', () => {
  it.each([
    ['Asha Testwala\nPune', 'Asha Testwala'],
    ['  \n  Rohan Q. Example-Patel  \nx', 'Rohan Q. Example-Patel'],
    ['José Müller\n', 'José Müller'],
  ])('reads the name from the first line of %j', (text, name) => {
    expect(guessName(text)).toBe(name);
  });

  it.each([
    'RESUME\nAsha Testwala',
    'Curriculum Vitae',
    'asha testwala',
    'Software Engineer at Example Co Ltd',
    'Asha',
    '',
  ])('does not guess from %j', (text) => {
    expect(guessName(text)).toBe('');
  });

  it('replaces every occurrence of the guessed name, any case', () => {
    const { redactedText } = redactContact('Asha Testwala\nASHA TESTWALA built it');

    expect(redactedText).toBe('[NAME]\n[NAME] built it');
  });
});

describe('redactContact: fictional fixture resumes', () => {
  it.each(Object.entries(FIXTURE_RESUMES))(
    '%s: finds the contact and removes it',
    (_n, fixture) => {
      const { redactedText, contact } = redactContact(fixture.text);

      expect(contact.name).toBe(fixture.expected.name);
      expect(contact.email).toBe(fixture.expected.email);
      expect(contact.phone).toBe(fixture.expected.phone);
      expect(contact.links.map((l) => l.url)).toEqual(fixture.expected.links);

      expect(redactedText).not.toContain(fixture.expected.email);
      expect(redactedText).not.toContain(fixture.expected.phone);
      for (const link of fixture.expected.links) {
        expect(redactedText).not.toContain(link.replace(/^https:\/\//, ''));
      }
      if (fixture.expected.name !== '') expect(redactedText).not.toContain(fixture.expected.name);
    },
  );

  it('keeps the rest of the content (dates, numbers, skills) intact', () => {
    const { redactedText } = redactContact(FIXTURE_RESUMES.experienced.text);

    expect(redactedText).toContain('Jan 2020 – Present');
    expect(redactedText).toContain('22% in 2021 2022 2023');
    expect(redactedText).toContain('C++, .NET');
  });
});
