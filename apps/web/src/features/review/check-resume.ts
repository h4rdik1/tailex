import { ResumeDataSchema, type ResumeData } from '@tailex/shared';

export interface ResumeProblem {
  where: string;
  message: string;
}

/** The same Zod schema the server uses, so the user sees problems before the render request. */
export function findProblems(resume: ResumeData): ResumeProblem[] {
  const result = ResumeDataSchema.safeParse(resume);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    where: describePath(issue.path),
    message: issue.message,
  }));
}

const PLACEHOLDER = /\[(NAME|EMAIL|PHONE|LINK)\]/;

/**
 * Redaction placeholders the AI copied into a field (e.g. a bullet that says "see [LINK]").
 * We can't guess what they stood for, so the user is asked to fix them by hand.
 */
export function findPlaceholders(resume: ResumeData): string[] {
  const found: string[] = [];
  walkStrings(resume, [], (path, text) => {
    if (PLACEHOLDER.test(text)) found.push(describePath(path));
  });
  return found;
}

function walkStrings(
  value: unknown,
  path: PropertyKey[],
  visit: (path: PropertyKey[], text: string) => void,
): void {
  if (typeof value === 'string') {
    visit(path, value);
  } else if (Array.isArray(value)) {
    value.forEach((item: unknown, index) => {
      walkStrings(item, [...path, index], visit);
    });
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key !== 'id') walkStrings(item, [...path, key], visit);
    }
  }
}

const SECTION_LABELS: Record<string, string> = {
  contact: 'Contact',
  links: 'Link',
  skills: 'Skill group',
  items: 'Skill',
  experience: 'Experience',
  projects: 'Project',
  tech: 'Tech',
  education: 'Education',
  bullets: 'Bullet',
};

/** ['experience', 0, 'bullets', 2, 'text'] → "Experience 1 › Bullet 3 › text". */
export function describePath(path: readonly PropertyKey[]): string {
  const parts: string[] = [];
  for (const key of path) {
    if (typeof key === 'number') {
      parts.push(`${parts.pop() ?? ''} ${String(key + 1)}`.trim());
    } else {
      const name = String(key);
      parts.push(SECTION_LABELS[name] ?? name.replace(/([A-Z])/g, ' $1').toLowerCase());
    }
  }
  return parts.join(' › ');
}
