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
  /** Size level, 1 (smallest) to LAYOUT_LEVELS. See `scaleFor`. */
  layout: Layout;
}

/** Level 6 is exactly the reference design (scale 1.00); each level is 2% larger or smaller. */
export const REFERENCE_LEVEL = 6;
const SCALE_STEP = 0.02;

export function scaleFor(level: Layout): number {
  return 1 + (level - REFERENCE_LEVEL) * SCALE_STEP;
}

/** Rounded to 2 decimals, so the .tex stays readable and identical numbers print identically. */
function r(value: number, decimals = 2): string {
  return String(Number(value.toFixed(decimals)));
}

/**
 * Every measurement of the reference design (a Jake's-Resume-style layout, ADR-036, measured
 * against the original compiled with titlesec/enumitem), multiplied by ONE scale factor.
 * Font, line spacing, gaps and margins all grow together, so every size has the same look and
 * rhythm. Small "minus" values in the gaps let TeX squeeze a page that is just too long.
 */
export function layoutFor(level: Layout) {
  const s = scaleFor(level);
  const glue = (natural: number, grow: number, shrink: number): string =>
    `${r(natural * s)}pt plus ${r(grow * s)}pt minus ${r(shrink * s)}pt`;
  return {
    top: `${r(0.4 * s, 3)}in`,
    bottom: `${r(0.35 * s, 3)}in`,
    side: `${r(0.45 * s, 3)}in`,
    baseFont: `${r(10 * s)}}{${r(12 * s)}`,
    itemFont: `${r(9.8 * s)}}{${r(12 * s)}`,
    skillsFont: `${r(9.8 * s)}}{${r(12.5 * s)}`,
    smallFont: `${r(9 * s)}}{${r(11 * s)}`,
    contactFont: `${r(8 * s)}}{${r(9.5 * s)}`,
    headingFont: `${r(14.4 * s)}}{${r(18 * s)}`,
    nameFont: `${r(24.88 * s)}}{${r(30 * s)}`,
    sectionBefore: glue(8, 3, 1),
    sectionAfter: `${r(8 * s)}pt`,
    entryGap: glue(2, 1, 0.5),
    bulletGap: glue(1.6, 0.5, 0.4),
    strutHeight: `${r(8.4 * s)}pt`,
    strutDepth: `${r(3.6 * s)}pt`,
    afterName: `${r(2 * s)}pt`,
    afterHeader: `${r(3 * s)}pt`,
  };
}
type LayoutValues = ReturnType<typeof layoutFor>;
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
    `% tailex-layout: ${String(options.layout)}`,
    preamble(layoutFor(options.layout)),
    '\\begin{document}',
    '\\basefont',
    ...body,
    // Measure how much of the page the content uses (natural height vs. text area height).
    `\\par\\typeout{${FILL_MARKER} \\the\\pagetotal\\space\\the\\pagegoal}`,
    '\\end{document}',
    '',
  ].join('\n');
  return { tex, droppedChars: cleaner.droppedChars() };
}

function preamble(p: LayoutValues): string {
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
\newlength{\afternamegap}\setlength{\afternamegap}{${p.afterName}}
\newlength{\afterheadergap}\setlength{\afterheadergap}{${p.afterHeader}}
\newlength{\entryindent}\setlength{\entryindent}{0.15in}
% Every text size is scaled with everything else (see layoutFor), not taken from the class.
\newcommand{\basefont}{\fontsize{${p.baseFont}}\selectfont}
\newcommand{\itemfont}{\fontsize{${p.itemFont}}\selectfont}
\newcommand{\skillsfont}{\fontsize{${p.skillsFont}}\selectfont}
\newcommand{\smallfont}{\fontsize{${p.smallFont}}\selectfont}
\newcommand{\contactfont}{\fontsize{${p.contactFont}}\selectfont}
\newcommand{\headingfont}{\fontsize{${p.headingFont}}\selectfont}
\newcommand{\namefont}{\fontsize{${p.nameFont}}\selectfont}
% A strut reserves a full 12pt-style line (scaled), like a table row, whatever the font size.
\newcommand{\sstrut}{\vrule width 0pt height ${p.strutHeight} depth ${p.strutDepth}}
% One macro draws every heading, so every underline has the same width, thickness and gap.
% The strut gives the title a full line depth, so the rule sits a few points below it.
\newcommand{\resumesection}[1]{\par\vspace{\sectionbefore}{\headingfont\scshape #1\sstrut\par}\hrule height 0.4pt\vspace{\sectionafter}}
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
    isFilled(contact.name) ? `{\\namefont\\scshape\\bfseries ${safe(contact.name)}\\par}` : '',
    isFilled(contact.name) && details.length > 0 ? '\\vspace{\\afternamegap}' : '',
    details.length > 0 ? `{\\contactfont ${details.join(' \\textbar{} ')}\\par}` : '',
  ].filter(isFilled);

  return lines.length === 0
    ? ''
    : `{\\centering\n${lines.join('\n')}\n}\n\\vspace{\\afterheadergap}`;
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

/** When a resume has no skill categories the parser makes one group called "Skills". */
const GENERIC_SKILL_LABELS = new Set(['skills', 'technical skills', 'key skills', 'core skills']);

/** A skill that is a sentence ("Knowledge of luxury fabrics, including wool, silk") not a keyword. */
function isPhrase(skill: string): boolean {
  return skill.includes(',') || skill.trim().split(/\s+/).length > 5;
}

function renderSkillGroup(group: SkillGroup, safe: SafeText): string {
  const skills = group.items.filter(isFilled);
  if (skills.length === 0) return '';
  // The section heading already says "Technical Skills", so a generic label would repeat it.
  const hasRealCategory =
    isFilled(group.category) && !GENERIC_SKILL_LABELS.has(group.category.trim().toLowerCase());
  if (hasRealCategory) return `\\textbf{${safe(group.category)}}: ${skills.map(safe).join(', ')}`;

  // Uncategorised: keywords read well as one comma list, but phrases get one line each, like the
  // original resume, because commas inside a phrase would make a comma list ambiguous.
  return skills.some(isPhrase) ? skills.map(safe).join('\\\\\n') : skills.map(safe).join(', ');
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
      (text) => `\\textit{\\smallfont ${safe(text)}}`,
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
    `{\\smallfont ${heading}}\\sstrut\\par`,
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
      (text) => `\\textit{\\smallfont ${safe(text)}}`,
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
  return `${left}\\hfill ${right}\\sstrut\\par`;
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
