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
}

interface LayoutProfile {
  /** Page margins. */
  top: string;
  bottom: string;
  side: string;
  /** Bullet and skills text: font size / line distance, in pt (skills lines are a bit airier). */
  itemFont: number;
  itemLeading: number;
  skillsLeading: number;
  /** Vertical gaps, in pt. Small "minus" values let TeX squeeze a nearly-fitting page. */
  sectionBefore: string;
  sectionAfter: string;
  entryGap: string;
  bulletGap: string;
}

/**
 * `standard` reproduces the owner's reference design (a Jake's-Resume-style layout, ADR-036),
 * measured against the original compiled with titlesec/enumitem. `compact` and `dense` shrink it
 * step by step and are only used when the resume would otherwise need a second page.
 */
export const LAYOUT_PROFILES: Record<Layout, LayoutProfile> = {
  standard: {
    top: '0.4in',
    bottom: '0.35in',
    side: '0.45in',
    itemFont: 9.8,
    itemLeading: 12,
    skillsLeading: 12.5,
    sectionBefore: '11.5pt plus 3pt minus 1pt',
    sectionAfter: '8pt',
    entryGap: '2pt plus 1pt minus 0.5pt',
    bulletGap: '1.6pt plus 0.5pt minus 0.4pt',
  },
  compact: {
    top: '0.35in',
    bottom: '0.3in',
    side: '0.4in',
    itemFont: 9.5,
    itemLeading: 11.4,
    skillsLeading: 11.8,
    sectionBefore: '9pt plus 2pt minus 1pt',
    sectionAfter: '6.5pt',
    entryGap: '1.5pt plus 1pt minus 0.5pt',
    bulletGap: '1pt plus 0.5pt minus 0.3pt',
  },
  dense: {
    top: '0.3in',
    bottom: '0.3in',
    side: '0.35in',
    itemFont: 9,
    itemLeading: 10.8,
    skillsLeading: 11,
    sectionBefore: '7pt plus 2pt minus 1pt',
    sectionAfter: '5pt',
    entryGap: '1pt plus 0.5pt minus 0.3pt',
    bulletGap: '0.5pt plus 0.3pt minus 0.2pt',
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

  const body = [
    renderHeader(resume.contact, safe),
    renderSkills(resume.skills, safe),
    renderSection('Experience', resume.experience, (entry) => renderExperience(entry, safe), safe),
    renderSection('Projects', resume.projects, (entry) => renderProject(entry, safe), safe),
    renderSection('Education', resume.education, (entry) => renderEducation(entry, safe), safe),
  ].filter(isFilled);

  const tex = [
    `% tailex-layout: ${options.layout}`,
    preamble(LAYOUT_PROFILES[options.layout]),
    '\\begin{document}',
    ...body,
    // Measure how much of the page the content uses (natural height vs. text area height).
    `\\par\\typeout{${FILL_MARKER} \\the\\pagetotal\\space\\the\\pagegoal}`,
    '\\end{document}',
    '',
  ].join('\n');
  return { tex, droppedChars: cleaner.droppedChars() };
}

function preamble(p: LayoutProfile): string {
  // Only packages from the minimal TeX Live in Dockerfile.dev (docs/DECISIONS.md ADR-020, ADR-036).
  // Every vertical gap is one of the named lengths below; there is no negative \vspace.
  return String.raw`\documentclass[letterpaper,10pt]{article}
\usepackage[letterpaper,top=${p.top},bottom=${p.bottom},left=${p.side},right=${p.side}]{geometry}
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
\raggedbottom
\newlength{\sectionbefore}\setlength{\sectionbefore}{${p.sectionBefore}}
\newlength{\sectionafter}\setlength{\sectionafter}{${p.sectionAfter}}
\newlength{\entrygap}\setlength{\entrygap}{${p.entryGap}}
\newlength{\bulletgap}\setlength{\bulletgap}{${p.bulletGap}}
\newlength{\entryindent}\setlength{\entryindent}{0.15in}
\newcommand{\itemfont}{\fontsize{${String(p.itemFont)}}{${String(p.itemLeading)}}\selectfont}
\newcommand{\skillsfont}{\fontsize{${String(p.itemFont)}}{${String(p.skillsLeading)}}\selectfont}
% One macro draws every heading, so every underline has the same width, thickness and gap.
% The \strut gives the title a full line depth, so the rule sits a few points below it.
\newcommand{\resumesection}[1]{\par\vspace{\sectionbefore}{\large\scshape #1\strut\par}\hrule height 0.4pt\vspace{\sectionafter}}
% Entries (jobs, projects, schools) are indented under the rule.
\newenvironment{resumeentries}{\begin{list}{}{\setlength{\leftmargin}{\entryindent}\setlength{\labelwidth}{0pt}\setlength{\labelsep}{0pt}\setlength{\itemindent}{0pt}\setlength{\topsep}{0pt}\setlength{\partopsep}{0pt}\setlength{\parsep}{0pt}\setlength{\itemsep}{\entrygap}}}{\end{list}}
% Bullets: a small dot hanging just left of the text, text indented under the entry heading.
\newenvironment{resumebullets}{\begin{list}{$\vcenter{\hbox{\tiny$\bullet$}}$}{\setlength{\leftmargin}{\entryindent}\setlength{\labelsep}{0.5em}\setlength{\topsep}{\bulletgap}\setlength{\partopsep}{0pt}\setlength{\parsep}{0pt}\setlength{\itemsep}{\bulletgap}}\itemfont}{\end{list}}`;
}

function renderHeader(contact: Contact, safe: SafeText): string {
  const details = [contact.location, contact.phone, contact.email]
    .filter(isFilled)
    .map(safe)
    .concat(contact.links.map((link) => renderLink(link.url, link.label, safe)));

  const lines = [
    isFilled(contact.name) ? `{\\Huge\\scshape\\bfseries ${safe(contact.name)}\\par}` : '',
    isFilled(contact.name) && details.length > 0 ? '\\vspace{2pt}' : '',
    details.length > 0 ? `{\\footnotesize ${details.join(' \\textbar{} ')}\\par}` : '',
  ].filter(isFilled);

  return lines.length === 0 ? '' : `{\\centering\n${lines.join('\n')}\n}\n\\vspace{3pt}`;
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
    `\\item[] {\\skillsfont ${lines.join('\\\\\n')}\\par}`,
    '\\end{resumeentries}',
  ].join('\n');
}

function renderSkillGroup(group: SkillGroup, safe: SafeText): string {
  const items = group.items.filter(isFilled).map(safe).join(', ');
  if (items === '') return '';
  return isFilled(group.category) ? `\\textbf{${safe(group.category)}}: ${items}` : items;
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
      : `\\textbf{${safe(entry.name)}} \\textbar{} \\textit{${tech}}`;
  return [
    `{\\small ${heading}}\\strut\\par`,
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

/**
 * Left text, then right text pushed to the margin. The \strut reserves a full line height and
 * depth (like a table row), so a small italic line still keeps even spacing to the next line.
 */
function twoColumnLine(left: string, right: string): string {
  return `${left}\\hfill ${right}\\strut\\par`;
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
