import type { Contact, LlmParsedResume, ResumeData } from '@tailex/shared';
import { PLACEHOLDERS } from '../redact/redact-contact.ts';

/**
 * Turns the LLM's validated output into ResumeData:
 * 1. assigns stable ids (exp0, exp0-b1, ...) in code, never by the LLM (ADR-008);
 * 2. attaches the contact WE extracted (the LLM never saw it);
 * 3. puts contact values back where the LLM kept a placeholder in the body text.
 */
export function assembleResume(parsed: LlmParsedResume, contact: Contact): ResumeData {
  const restore = createPlaceholderRestorer(contact);

  return {
    contact,
    headline: restore(parsed.headline),
    summary: restore(parsed.summary),
    skills: parsed.skills.map((group, i) => ({
      id: `skills${String(i)}`,
      category: restore(group.category),
      items: group.items.map(restore),
    })),
    experience: parsed.experience.map((entry, i) => ({
      id: `exp${String(i)}`,
      title: restore(entry.title),
      company: restore(entry.company),
      location: restore(entry.location),
      startDate: entry.startDate,
      endDate: entry.endDate,
      bullets: entry.bullets.map((text, j) => ({
        id: `exp${String(i)}-b${String(j)}`,
        text: restore(text),
      })),
    })),
    projects: parsed.projects.map((entry, i) => ({
      id: `proj${String(i)}`,
      name: restore(entry.name),
      tech: entry.tech.map(restore),
      bullets: entry.bullets.map((text, j) => ({
        id: `proj${String(i)}-b${String(j)}`,
        text: restore(text),
      })),
    })),
    education: parsed.education.map((entry, i) => ({
      id: `edu${String(i)}`,
      school: restore(entry.school),
      degree: restore(entry.degree),
      location: restore(entry.location),
      startYear: entry.startYear,
      endYear: entry.endYear,
    })),
  };
}

/**
 * Replaces placeholders with the real value ONLY when it is unambiguous: [NAME]/[EMAIL]/[PHONE]
 * map to the single contact value, [LINK] only when exactly one link was found. Otherwise the
 * placeholder stays visible, and the user fixes it in the review form.
 */
function createPlaceholderRestorer(contact: Contact): (text: string) => string {
  const onlyLink = contact.links.length === 1 ? contact.links[0]?.label : undefined;
  const values: [string, string | undefined][] = [
    [PLACEHOLDERS.name, contact.name],
    [PLACEHOLDERS.email, contact.email],
    [PLACEHOLDERS.phone, contact.phone],
    [PLACEHOLDERS.link, onlyLink],
  ];
  return (text) =>
    values.reduce(
      (result, [placeholder, value]) =>
        value === undefined || value === '' ? result : result.replaceAll(placeholder, value),
      text,
    );
}
