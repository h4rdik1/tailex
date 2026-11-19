import type {
  Contact,
  Education,
  Experience,
  Project,
  ResumeData,
  SkillGroup,
  Spacing,
} from '@tailex/shared';
import { escapeHrefUrl } from './escape-href-url.ts';
import { escapeLatex } from './escape-latex.ts';
import { createTextCleaner } from './normalize-text.ts';

export interface RenderedTex {
  tex: string;
  /** Characters that were dropped because the PDF fonts can't print them (shown in the UI). */
  droppedChars: string[];
}

/** Layout numbers for each spacing mode. "tight" is offered when the resume spills to page 2. */
const LAYOUT: Record<Spacing, { margin: string; sectionGap: string; itemGap: string }> = {
  normal: { margin: '0.6in', sectionGap: '8pt', itemGap: '1pt' },
  tight: { margin: '0.45in', sectionGap: '4pt', itemGap: '0pt' },
};

/** Turns a user string into safe LaTeX text. Every user value must go through this. */
type SafeText = (text: string) => string;

/**
 * Builds the .tex source for one resume (docs/SPEC.md §7). Plain functions, no template engine:
 * each section is a small function, and ONLY `safe(...)` puts user text into the output.
 * Users never send LaTeX; they send ResumeData, and we decide every command that appears.
 */
export function renderResumeTex(resume: ResumeData, spacing: Spacing): RenderedTex {
  const cleaner = createTextCleaner();
  const safe: SafeText = (text) => escapeLatex(cleaner.clean(text));

  const body = [
    renderHeader(resume.contact, safe),
    renderSection('Experience', resume.experience, (entry) => renderExperience(entry, safe), safe),
    renderSection('Projects', resume.projects, (entry) => renderProject(entry, safe), safe),
    renderSection('Skills', resume.skills, (group) => renderSkillGroup(group, safe), safe),
    renderSection('Education', resume.education, (entry) => renderEducation(entry, safe), safe),
  ];

  const tex = [preamble(spacing), '\\begin{document}', ...body, '\\end{document}', ''].join('\n');
  return { tex, droppedChars: cleaner.droppedChars() };
}

function preamble(spacing: Spacing): string {
  const layout = LAYOUT[spacing];
  // Only packages from the minimal TeX Live in Dockerfile.dev (docs/DECISIONS.md ADR-020).
  return String.raw`\documentclass[10pt]{article}
\usepackage[a4paper,margin=${layout.margin}]{geometry}
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
\raggedright
\newcommand{\resumesection}[1]{\vspace{${layout.sectionGap}}{\large\bfseries #1}\par\vspace{2pt}\hrule\vspace{4pt}}
\newenvironment{resumebullets}{\begin{list}{\textbullet}{\setlength{\leftmargin}{1.2em}\setlength{\itemsep}{${layout.itemGap}}\setlength{\parsep}{0pt}\setlength{\topsep}{2pt}}}{\end{list}}`;
}

function renderHeader(contact: Contact, safe: SafeText): string {
  const details = [contact.email, contact.phone, contact.location]
    .filter(isFilled)
    .map(safe)
    .concat(contact.links.map((link) => renderLink(link.url, link.label, safe)));

  const lines = [
    isFilled(contact.name) ? `{\\LARGE\\bfseries ${safe(contact.name)}}` : '',
    // No plain spaces around the separator: equal \enspace gaps on both sides of "|".
    details.join('\\enspace\\textbar\\enspace{}'),
  ].filter(isFilled);

  return lines.length === 0 ? '' : `\\begin{center}\n${lines.join('\\\\[2pt]\n')}\n\\end{center}`;
}

function renderLink(url: string, label: string, safe: SafeText): string {
  const visibleText = isFilled(label) ? label : url;
  return `\\href{${escapeHrefUrl(url)}}{${safe(visibleText)}}`;
}

/** A titled section, or nothing at all when the list is empty (no empty headings). */
function renderSection<T>(
  title: string,
  entries: readonly T[],
  renderEntry: (entry: T) => string,
  safe: SafeText,
): string {
  if (entries.length === 0) return '';
  return [`\\resumesection{${safe(title)}}`, ...entries.map(renderEntry)].join('\n');
}

function renderExperience(entry: Experience, safe: SafeText): string {
  return [
    twoColumnLine(
      `\\textbf{${safe(entry.title)}}`,
      safe(dateRange(entry.startDate, entry.endDate)),
    ),
    twoColumnLine(`\\textit{${safe(entry.company)}}`, `\\textit{${safe(entry.location)}}`),
    renderBullets(
      entry.bullets.map((bullet) => bullet.text),
      safe,
    ),
  ].join('\n');
}

function renderProject(entry: Project, safe: SafeText): string {
  const tech = entry.tech.filter(isFilled).map(safe).join(', ');
  const heading =
    tech === ''
      ? `\\textbf{${safe(entry.name)}}`
      : `\\textbf{${safe(entry.name)}} \\textbar\\ \\textit{${tech}}`;
  return [
    `${heading}\\par`,
    renderBullets(
      entry.bullets.map((bullet) => bullet.text),
      safe,
    ),
  ].join('\n');
}

function renderSkillGroup(group: SkillGroup, safe: SafeText): string {
  const items = group.items.filter(isFilled).map(safe).join(', ');
  return `\\textbf{${safe(group.category)}:} ${items}\\par`;
}

function renderEducation(entry: Education, safe: SafeText): string {
  return [
    twoColumnLine(
      `\\textbf{${safe(entry.school)}}`,
      safe(dateRange(entry.startYear, entry.endYear)),
    ),
    twoColumnLine(safe(entry.degree), `\\textit{${safe(entry.location)}}`),
  ].join('\n');
}

/** Left text, then right text pushed to the margin. `\par` ends the line safely even if empty. */
function twoColumnLine(left: string, right: string): string {
  return `${left}\\hfill ${right}\\par`;
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
