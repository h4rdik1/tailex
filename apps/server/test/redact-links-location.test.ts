import { describe, expect, it } from 'vitest';
import { guessLocation, guessName, redactContact } from '../src/services/redact/redact-contact.ts';

/** Fictional people only (CLAUDE.md): example.com / example.org and non-working numbers. */
const HEADER = (contactLine: string) => `Asha Testwala\n${contactLine}\n\nExperience\nEngineer`;

describe('redactContact: link targets hidden inside the file', () => {
  const text = HEADER('Pune, India | 9000000000 | asha@example.com | LinkedIn | GitHub');

  it('adds the real addresses with friendly labels (LinkedIn | GitHub)', () => {
    const { contact } = redactContact(text, [
      'https://www.linkedin.com/in/asha-example',
      'https://github.com/asha-example',
    ]);

    expect(contact.links).toEqual([
      { id: 'link0', label: 'LinkedIn', url: 'https://www.linkedin.com/in/asha-example' },
      { id: 'link1', label: 'GitHub', url: 'https://github.com/asha-example' },
    ]);
  });

  it('labels unknown sites with their address, without https://', () => {
    const { contact } = redactContact(text, ['https://asha.example.org/work/']);

    expect(contact.links[0]).toMatchObject({
      label: 'asha.example.org/work',
      url: 'https://asha.example.org/work/',
    });
  });

  it('counts the same page once, even when written differently in the text and in the link', () => {
    const withVisible = HEADER('Pune, India | github.com/asha-example');

    const { contact } = redactContact(withVisible, ['https://www.github.com/asha-example/']);

    expect(contact.links).toHaveLength(1);
    expect(contact.links[0]?.label).toBe('github.com/asha-example'); // the visible one wins
  });

  it('drops hidden links that are not safe http(s) URLs for the PDF', () => {
    const { contact } = redactContact(text, [
      'https://a.example/}\\input{x}',
      'https://a.example/has space',
      'https://ok.example/page',
    ]);

    expect(contact.links.map((link) => link.url)).toEqual(['https://ok.example/page']);
  });

  it('keeps at most 5 links', () => {
    const urls = Array.from({ length: 9 }, (_, i) => `https://site${String(i)}.example/x`);

    expect(redactContact(text, urls).contact.links).toHaveLength(5);
  });

  it('uses a mailto link for the email only when the text has none', () => {
    const noEmail = HEADER('Pune, India | 9000000000');

    expect(redactContact(noEmail, ['mailto:asha@example.com?subject=hi']).contact.email).toBe(
      'asha@example.com',
    );
    expect(redactContact(text, ['mailto:other@example.com']).contact.email).toBe(
      'asha@example.com',
    );
    expect(redactContact(noEmail, ['mailto:not an address']).contact.email).toBe('');
  });

  it('never puts a hidden address into the text that goes to the LLM', () => {
    const { redactedText } = redactContact(text, ['https://www.linkedin.com/in/asha-example']);

    expect(redactedText).not.toContain('asha-example');
  });

  it('behaves exactly as before when there are no hidden links', () => {
    expect(redactContact(text).contact.links).toEqual([]);
  });
});

describe('guessLocation', () => {
  it.each([
    [
      'city and state in a contact line',
      '[NAME]\nBangalore, Karnataka | [PHONE] | [EMAIL] | LinkedIn | GitHub',
      'Bangalore, Karnataka',
    ],
    ['city and country', '[NAME]\nPune, India | [EMAIL]', 'Pune, India'],
    ['location first, no pipes', '[NAME]\nPune, India [PHONE] [EMAIL]', 'Pune, India'],
    ['dot separators', '[NAME]\n[EMAIL] · [PHONE] · Austin, TX', 'Austin, TX'],
    [
      'a postcode',
      '[NAME]\n[EMAIL] | Pune, Maharashtra 411001 | [PHONE]',
      'Pune, Maharashtra 411001',
    ],
    ['a single city between contact details', '[NAME]\n[PHONE] | Bangalore | [EMAIL]', 'Bangalore'],
    ['accents', '[NAME]\nZürich, Switzerland | [EMAIL]', 'Zürich, Switzerland'],
    ['a location on its own line', '[NAME]\nPune, India\n[EMAIL] | [PHONE]', 'Pune, India'],
  ])('finds %s', (_name, text, expected) => {
    expect(guessLocation(text)).toBe(expected);
  });

  it.each([
    ['link labels only', '[NAME]\n[EMAIL] | [PHONE] | LinkedIn | GitHub | Portfolio'],
    ['labels with colons', '[NAME]\nEmail: [EMAIL]   Phone: [PHONE]'],
    ['no header details at all', '[NAME]\n\nExperience\nEngineer, Example Co, Pune, India'],
    ['a name we failed to recognise on a line of its own', 'Mei Lin Fictional\n[EMAIL] | [PHONE]'],
    ['an email or number turned into text', '[NAME]\nasha | 90000'],
    [
      'a long sentence',
      '[NAME]\nExperienced engineer who builds web applications for customers around the world | [EMAIL]',
    ],
  ])('returns nothing for %s', (_name, text) => {
    expect(guessLocation(text)).toBe('');
  });

  it('does not read past the header: a job location further down is not the contact location', () => {
    const text = '[NAME]\n[EMAIL] | [PHONE]\nExperience\nSoftware Engineer | Pune, India';

    expect(guessLocation(text)).toBe('');
  });

  it('does not read past the first 8 header lines', () => {
    const filler = Array.from({ length: 8 }, (_, i) => `line ${String(i)}`).join('\n');

    expect(guessLocation(`[NAME]\n${filler}\nPune, India | [EMAIL]`)).toBe('');
  });

  it('reads a sidebar CONTACT block: name, title, heading, details, then the place', () => {
    const text = [
      '[NAME]',
      'Master Tailor',
      'CONTACT',
      '[PHONE]',
      '[EMAIL]',
      'Springfield, Exampleland, Westbury',
      'EDUCATION',
      'Certificate in Tailoring, Example Academy, Westbury',
    ].join('\n');

    expect(guessLocation(text)).toBe('Springfield, Exampleland, Westbury');
  });

  it('stops at the first real section heading, so a school city is not the location', () => {
    const text = '[NAME]\nMaster Tailor\nEDUCATION\nExample Academy, Westbury, Exampleland';

    expect(guessLocation(text)).toBe('');
  });
});

describe('guessName and redaction: a name printed over two lines', () => {
  const sidebarText = [
    'Mara',
    'Fictional',
    'Master Tailor',
    'CONTACT',
    '(445) 678-1234',
    'mara.fictional@example.com',
    'Springfield, Exampleland, Westbury',
    'EDUCATION',
    '2000 - 2002',
  ].join('\n');

  it('joins two single-word lines into the name', () => {
    expect(guessName(sidebarText)).toBe('Mara Fictional');
  });

  it('redacts the name even though it is split over two lines (no leak to the LLM)', () => {
    const { redactedText, contact } = redactContact(`${sidebarText}\nMara Fictional wrote this.`);

    expect(contact.name).toBe('Mara Fictional');
    expect(redactedText).not.toMatch(/Mara|Fictional/);
    expect(redactedText.startsWith('[NAME]\nMaster Tailor')).toBe(true);
  });

  it('also fills the whole contact block of this sidebar layout', () => {
    const { contact } = redactContact(sidebarText);

    expect(contact).toMatchObject({
      name: 'Mara Fictional',
      email: 'mara.fictional@example.com',
      phone: '(445) 678-1234',
      location: 'Springfield, Exampleland, Westbury',
    });
  });

  it.each([
    ['two section headings', 'CONTACT\nEDUCATION\nSomething'],
    ['a heading and a name word', 'Experience\nHamilton'],
    ['a lowercase second line', 'Mara\nfictional'],
    ['a first line that is a sentence', 'Mara builds things\nFictional'],
    ['a single word only', 'Mara'],
  ])('does not invent a name from %s', (_name, text) => {
    expect(guessName(text)).toBe('');
  });

  it('keeps the existing rule: a normal one-line name still works', () => {
    expect(guessName('Asha Testwala\nPune, India')).toBe('Asha Testwala');
  });
});

describe('redactContact: location', () => {
  it('fills in the location from the header and keeps the real fixtures working', () => {
    const { contact } = redactContact(
      HEADER('Bangalore, Karnataka | 9000000000 | asha@example.com'),
    );

    expect(contact.location).toBe('Bangalore, Karnataka');
    expect(contact.name).toBe('Asha Testwala');
  });
});
