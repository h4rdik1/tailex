import { z } from 'zod';

/**
 * Size limits for every field. They keep one request small enough to compile quickly
 * (abuse protection, docs/SECURITY.md T9) while fitting any real one-page resume.
 */
export const RESUME_LIMITS = {
  shortText: 120,
  bullet: 400,
  url: 200,
  links: 5,
  bulletsPerEntry: 12,
  experience: 10,
  projects: 8,
  education: 5,
  skillGroups: 10,
  skillsPerGroup: 30,
  techPerProject: 15,
} as const;

/**
 * Links must be plain http(s) URLs. Characters that are dangerous inside LaTeX `\href{...}`
 * (backslash, braces, spaces, `$`, `^`, `|`, quotes) are not allowed at all.
 * The few allowed specials (`%`, `#`, `&`) are escaped by `escapeHrefUrl` on the server.
 */
export const SAFE_URL_PATTERN = /^https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!&'()*+,;=%]+$/;

const shortText = z.string().max(RESUME_LIMITS.shortText);

/** Ids are assigned by our code after parsing (docs/DECISIONS.md ADR-008), never by the LLM. */
export const ItemIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Invalid id');

export const BulletSchema = z.object({
  id: ItemIdSchema,
  text: z.string().max(RESUME_LIMITS.bullet),
});

export const LinkSchema = z.object({
  id: ItemIdSchema,
  label: shortText,
  url: z
    .string()
    .max(RESUME_LIMITS.url)
    .regex(SAFE_URL_PATTERN, 'Links must be http(s) URLs without spaces, quotes or braces'),
});

export const ContactSchema = z.object({
  name: shortText,
  email: shortText,
  phone: shortText,
  location: shortText,
  links: z.array(LinkSchema).max(RESUME_LIMITS.links),
});

export const SkillGroupSchema = z.object({
  id: ItemIdSchema,
  category: shortText,
  items: z.array(shortText).max(RESUME_LIMITS.skillsPerGroup),
});

export const ExperienceSchema = z.object({
  id: ItemIdSchema,
  title: shortText,
  company: shortText,
  location: shortText,
  startDate: shortText,
  endDate: shortText,
  bullets: z.array(BulletSchema).max(RESUME_LIMITS.bulletsPerEntry),
});

export const ProjectSchema = z.object({
  id: ItemIdSchema,
  name: shortText,
  tech: z.array(shortText).max(RESUME_LIMITS.techPerProject),
  bullets: z.array(BulletSchema).max(RESUME_LIMITS.bulletsPerEntry),
});

export const EducationSchema = z.object({
  id: ItemIdSchema,
  school: shortText,
  degree: shortText,
  location: shortText,
  startYear: shortText,
  endYear: shortText,
});

/** The full resume as the user reviews and edits it (docs/SPEC.md §4). */
export const ResumeDataSchema = z.object({
  contact: ContactSchema,
  skills: z.array(SkillGroupSchema).max(RESUME_LIMITS.skillGroups),
  experience: z.array(ExperienceSchema).max(RESUME_LIMITS.experience),
  projects: z.array(ProjectSchema).max(RESUME_LIMITS.projects),
  education: z.array(EducationSchema).max(RESUME_LIMITS.education),
});

export type Bullet = z.infer<typeof BulletSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type SkillGroup = z.infer<typeof SkillGroupSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type ResumeData = z.infer<typeof ResumeDataSchema>;
