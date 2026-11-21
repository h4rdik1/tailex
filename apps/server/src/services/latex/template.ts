import type {
  Contact,
  Education,
  Experience,
  Layout,
  Project,
  ResumeData,
  SkillGroup,
} from '@tailex/shared';
import { escapeHrefUrl } from './escape-href-url.ts';
import { escapeLatex } from './escape-latex.ts';
import { createTextCleaner } from './normalize-text.ts';

export interface RenderedTex {
  tex: string;
  /** Characters that were dropped because the PDF fonts can't print them (shown in the UI). */
  droppedChars: string[];
}

export interface TemplateOptions {
  layout: Layout;
  /** Stretch the gaps so the last line sits on the bottom margin (only for nearly full pages). */
  fillPage: boolean;
}

interface LayoutProfile {
  /** Body font size and line distance, in pt. */
  font: number;
  leading: number;
  margin: string;
  /**
   * Gaps are TeX "glue": `<natural> plus <can grow> minus <can shrink>`. With \flushbottom,
   * TeX grows them in proportion to fill the page, so big gaps stay big and small ones small.
   */
  sectionGap: string;
  entryGap: string;
  bulletGap: string;
}

/** Roomiest first. The auto-fit loop (layout.ts) walks down this list until it fits one page. */
export const LAYOUT_PROFILES: Record<Layout, LayoutProfile> = {
  roomy: {
    font: 11,
    leading: 14.5,
    margin: '0.6in',
    sectionGap: '11pt plus 8pt minus 2pt',
    entryGap: '7pt plus 5pt minus 1pt',
    bulletGap: '2.4pt plus 2pt minus 0.6pt',
  },
  spacious: {
    font: 10.5,
    leading: 13.5,
    margin: '0.55in',
    sectionGap: '9pt plus 6pt minus 2pt',
    entryGap: '6pt plus 4pt minus 1pt',
    bulletGap: '1.8pt plus 1.5pt minus 0.5pt',
  },
  comfortable: {
    font: 10,
    leading: 12.6,
    margin: '0.5in',
    sectionGap: '7pt plus 5pt minus 2pt',
    entryGap: '5pt plus 3pt minus 1pt',
    bulletGap: '1.4pt plus 1.2pt minus 0.4pt',
  },
  compact: {
    font: 9.8,
    leading: 12,
    margin: '0.45in',
    sectionGap: '5pt plus 4pt minus 1pt',
    entryGap: '4pt plus 2pt minus 1pt',
    bulletGap: '1pt plus 1pt minus 0.3pt',
  },
  dense: {
    font: 9.5,
    leading: 11.4,
    margin: '0.4in',
    sectionGap: '4pt plus 3pt minus 1pt',
    entryGap: '3pt plus 2pt minus 1pt',
    bulletGap: '0.6pt plus 0.8pt minus 0.2pt',
  },
};

/** Written to the log at the end, so the server can measure how full the page is. */
export const FILL_MARKER = 'TAILEX-FILL';

/** Turns a user string into safe LaTeX text. Every user value must go through this. */
type SafeText = (text: string) => string;

/**
 * Builds the .tex source for one resume (docs/SPEC.md §7). Plain functions, no template engine:
 * each section is a small function, and ONLY `safe(...)` puts user text into the output.
 * Users never send LaTeX; they send ResumeData, and we decide every command that appears.
 * Section order: Skills, Experience, Projects, Education (empty sections are skipped).
 */
export function renderResumeTex(resume: ResumeData, options: TemplateOptions): RenderedTex {
  const cleaner = createTextCleaner();
  const safe: SafeText = (text) => escapeLatex(cleaner.clean(text));
  const profile = LAYOUT_PROFILES[options.layout];

  const body = [
    renderHeader(resume.contact, safe),
    renderSkills(resume.skills, safe),
    renderSection('Experience', resume.experience, (entry) => renderExperience(entry, safe), safe),
    renderSection('Projects', resume.projects, (entry) => renderProject(entry, safe), safe),
    renderSection('Education', resume.education, (entry) => renderEducation(entry, safe), safe),
  ].filter(isFilled);

  const tex = [
    `% tailex-layout: ${options.layout}`,
    preamble(profile, options.fillPage),
    '\\begin{document}',
    `\\fontsize{${String(profile.font)}}{${String(profile.leading)}}\\selectfont`,
    ...body,
    // Measure how much of the page the content uses (natural height vs. text area height).
    `\\par\\typeout{${FILL_MARKER} \\the\\pagetotal\\space\\the\\pagegoal}`,
    // \end{document} ends the page with \vfil, which would soak up all the space. A plain
    // forced break instead lets \flushbottom stretch our gaps down to the bottom margin.
    options.fillPage ? '\\penalty-10000' : '',
    '\\end{document}',
    '',
  ].join('\n');
  return { tex, droppedChars: cleaner.droppedChars() };
}

function preamble(profile: LayoutProfile, fillPage: boolean): string {
  // Only packages from the minimal TeX Live in Dockerfile.dev (docs/DECISIONS.md ADR-020, ADR-036).
  // All vertical spacing comes from the three lengths below: no negative \vspace anywhere.
  return String.raw`\documentclass[letterpaper,10pt]{article}
\usepackage[letterpaper,margin=${profile.margin}]{geometry}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[hidelinks]{hyperref}
% Map every glyph to Unicode so ATS systems can copy the text out of the PDF correctly.
\input{glyphtounicode}
\pdfgentounicode=1
% Uncompressed object index: link targets stay readable for tests; the size cost is tiny.
\pdfobjcompresslevel=0
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\raggedright
${fillPage ? '\\flushbottom' : '\\raggedbottom'}
\newlength{\sectiongap}\setlength{\sectiongap}{${profile.sectionGap}}
\newlength{\entrygap}\setlength{\entrygap}{${profile.entryGap}}
\newlength{\bulletgap}\setlength{\bulletgap}{${profile.bulletGap}}
\newlength{\entryindent}\setlength{\entryindent}{0.15in}
% One macro draws every heading, so every underline has the same width and thickness.
\newcommand{\resumesection}[1]{\par\vspace{\sectiongap}{\large\scshape #1}\par\vspace{1pt}\hrule height 0.4pt\vspace{3pt}}
\newenvironment{resumeentries}{\begin{list}{}{\setlength{\leftmargin}{\entryindent}\setlength{\labelwidth}{0pt}\setlength{\labelsep}{0pt}\setlength{\itemindent}{0pt}\setlength{\topsep}{0pt}\setlength{\partopsep}{0pt}\setlength{\parsep}{0pt}\setlength{\itemsep}{\entrygap}}}{\end{list}}
\newenvironment{resumebullets}{\begin{list}{\small\textbullet}{\setlength{\leftmargin}{1em}\setlength{\labelwidth}{0.6em}\setlength{\labelsep}{0.4em}\setlength{\topsep}{\bulletgap}\setlength{\partopsep}{0pt}\setlength{\parsep}{0pt}\setlength{\itemsep}{\bulletgap}}}{\end{list}}`;
}

function renderHeader(contact: Contact, safe: SafeText): string {
  const details = [contact.location, contact.phone, contact.email]
    .filter(isFilled)
    .map(safe)
    .concat(contact.links.map((link) => renderLink(link.url, link.label, safe)));

  const lines = [
    isFilled(contact.name) ? `{\\Huge\\scshape\\bfseries ${safe(contact.name)}}\\par` : '',
    isFilled(contact.name) && details.length > 0 ? '\\vspace{4pt}' : '',
    // No plain spaces around the separator: equal \enspace gaps on both sides of "|".
    details.length > 0 ? `{\\small ${details.join('\\enspace\\textbar\\enspace{}')}}\\par` : '',
  ].filter(isFilled);

  return lines.length === 0 ? '' : `{\\centering\n${lines.join('\n')}\n}`;
}

function renderLink(url: string, label: string, safe: SafeText): string {
  const visibleText = isFilled(label) ? label : url;
  return `\\href{${escapeHrefUrl(url)}}{${safe(visibleText)}}`;
}

/** A titled section with indented entries, or nothing at all when the list is empty. */
function renderSection<T>(
  title: string,
  entries: readonly T[],
  renderEntry: (entry: T) => string,
  safe: SafeText,
): string {
  if (entries.length === 0) return '';
  return [
    `\\resumesection{${safe(title)}}`,
    '\\begin{resumeentries}',
    ...entries.map((entry) => `\\item[] ${renderEntry(entry)}`),
    '\\end{resumeentries}',
  ].join('\n');
}

/** All skill groups share one entry, one line per group: "Languages: TypeScript, SQL". */
function renderSkills(groups: readonly SkillGroup[], safe: SafeText): string {
  const lines = groups.map((group) => renderSkillGroup(group, safe)).filter(isFilled);
  if (lines.length === 0) return '';
  return [
    `\\resumesection{${safe('Technical Skills')}}`,
    '\\begin{resumeentries}',
    `\\item[] ${lines.join('\n')}`,
    '\\end{resumeentries}',
  ].join('\n');
}

function renderSkillGroup(group: SkillGroup, safe: SafeText): string {
  const items = group.items.filter(isFilled).map(safe).join(', ');
  if (items === '') return '';
  return isFilled(group.category)
    ? `\\textbf{${safe(group.category)}}: ${items}\\par`
    : `${items}\\par`;
}

function renderExperience(entry: Experience, safe: SafeText): string {
  return [
    twoColumnLine(
      `\\textbf{${safe(entry.title)}}`,
      safe(dateRange(entry.startDate, entry.endDate)),
    ),
    optionalTwoColumnLine(
      entry.company,
      entry.location,
      (text) => `\\textit{\\small ${safe(text)}}`,
    ),
    renderBullets(
      entry.bullets.map((bullet) => bullet.text),
      safe,
    ),
  ]
    .filter(isFilled)
    .join('\n');
}

function renderProject(entry: Project, safe: SafeText): string {
  const tech = entry.tech.filter(isFilled).map(safe).join(', ');
  const heading =
    tech === ''
      ? `\\textbf{${safe(entry.name)}}`
      : `\\textbf{${safe(entry.name)}} \\textbar\\ \\textit{\\small ${tech}}`;
  return [
    `${heading}\\par`,
    renderBullets(
      entry.bullets.map((bullet) => bullet.text),
      safe,
    ),
  ]
    .filter(isFilled)
    .join('\n');
}

function renderEducation(entry: Education, safe: SafeText): string {
  return [
    twoColumnLine(`\\textbf{${safe(entry.school)}}`, safe(entry.location)),
    optionalTwoColumnLine(
      entry.degree,
      dateRange(entry.startYear, entry.endYear),
      (text) => `\\textit{\\small ${safe(text)}}`,
    ),
  ]
    .filter(isFilled)
    .join('\n');
}

/** Left text, then right text pushed to the margin. `\par` ends the line safely even if empty. */
function twoColumnLine(left: string, right: string): string {
  return `${left}\\hfill ${right}\\par`;
}

/** A second line (company/location, degree/years) that is skipped when both sides are empty. */
function optionalTwoColumnLine(left: string, right: string, style: SafeText): string {
  if (!isFilled(left) && !isFilled(right)) return '';
  return twoColumnLine(isFilled(left) ? style(left) : '', isFilled(right) ? style(right) : '');
}

/** A LaTeX list fails with zero items, so empty bullet lists render nothing. */
function renderBullets(bullets: readonly string[], safe: SafeText): string {
  const filled = bullets.filter(isFilled);
  if (filled.length === 0) return '';
  const items = filled.map((text) => `  \\item ${safe(text)}`);
  return ['\\begin{resumebullets}', ...items, '\\end{resumebullets}'].join('\n');
}

/** "Jul 2023 – Present", or just one side if the other is missing. Nothing is invented. */
function dateRange(start: string, end: string): string {
  return [start, end].filter(isFilled).join(' – ');
}

function isFilled(text: string): boolean {
  return text.trim() !== '';
}
