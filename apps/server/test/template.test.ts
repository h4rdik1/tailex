import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, LayoutSchema, type ResumeData } from '@tailex/shared';
import {
  LAYOUT_PROFILES,
  renderResumeTex,
  type TemplateOptions,
} from '../src/services/latex/template.ts';

const BASE: TemplateOptions = { layout: 'comfortable', fillPage: false };

/** Only packages from the minimal TeX Live in the Docker image (ADR-020, ADR-036). */
const ALLOWED_PACKAGES = ['geometry', 'fontenc', 'lmodern', 'hyperref'];

function texFor(resume: ResumeData = FICTIONAL_RESUME, options = BASE): string {
  return renderResumeTex(resume, options).tex;
}

describe('renderResumeTex: page setup', () => {
  it('uses US Letter and only the allowed packages', () => {
    const tex = texFor();
    const packages = [...tex.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)].map((m) => m[1]);

    expect(tex).toContain('\\documentclass[letterpaper,10pt]{article}');
    expect(tex).toContain('letterpaper,margin=0.5in');
    expect(packages).toEqual(ALLOWED_PACKAGES);
  });

  it('never uses negative vertical space (the cause of overlapping lines)', () => {
    for (const layout of LayoutSchema.options) {
      for (const fillPage of [false, true]) {
        expect(texFor(FICTIONAL_RESUME, { layout, fillPage })).not.toMatch(/\\vspace\*?\{\s*-/);
      }
    }
  });

  it('has a profile for every layout, each with elastic gaps', () => {
    for (const layout of LayoutSchema.options) {
      const profile = LAYOUT_PROFILES[layout];
      expect(profile.sectionGap).toMatch(/plus .* minus/);
      expect(profile.entryGap).toMatch(/plus .* minus/);
      expect(profile.bulletGap).toMatch(/plus .* minus/);
    }
  });

  it('profiles get denser in order: smaller font, smaller margin', () => {
    const profiles = LayoutSchema.options.map((layout) => LAYOUT_PROFILES[layout]);
    for (let i = 1; i < profiles.length; i += 1) {
      const [roomier, denser] = [profiles[i - 1], profiles[i]];
      expect(denser?.font).toBeLessThan(roomier?.font ?? 0);
      expect(parseFloat(denser?.margin ?? '')).toBeLessThan(parseFloat(roomier?.margin ?? ''));
    }
  });

  it('stretches to the bottom margin only when asked', () => {
    const ragged = texFor(FICTIONAL_RESUME, { layout: 'roomy', fillPage: false });
    const filled = texFor(FICTIONAL_RESUME, { layout: 'roomy', fillPage: true });

    expect(ragged).toContain('\\raggedbottom');
    expect(ragged).not.toContain('\\penalty-10000');
    expect(filled).toContain('\\flushbottom');
    expect(filled).toContain('\\penalty-10000');
  });

  it('writes the fill marker and the layout name', () => {
    const tex = texFor(FICTIONAL_RESUME, { layout: 'dense', fillPage: false });

    expect(tex).toContain('\\typeout{TAILEX-FILL \\the\\pagetotal\\space\\the\\pagegoal}');
    expect(tex.split('\n')[0]).toBe('% tailex-layout: dense');
  });
});

describe('renderResumeTex: sections', () => {
  it('orders sections Skills, Experience, Projects, Education', () => {
    const tex = texFor();
    const order = [...tex.matchAll(/\\resumesection\{([^}]+)\}/g)].map((m) => m[1]);

    expect(order).toEqual(['Technical Skills', 'Experience', 'Projects', 'Education']);
  });

  it('draws every heading through the one macro, so all underlines are identical', () => {
    const tex = texFor();

    expect(tex.match(/\\hrule/g)).toHaveLength(1); // only inside the \resumesection definition
    expect(tex).not.toMatch(/\\section\b|\\rule\{/);
  });

  it('skips empty sections and empty skill groups', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.experience = [];
    resume.skills = [{ id: 'skills0', category: 'Tools', items: ['', ' '] }];
    const tex = texFor(resume);

    expect(tex).not.toContain('{Experience}');
    expect(tex).not.toContain('Technical Skills');
    expect(tex).toContain('{Projects}');
  });

  it('skips the company line when company and location are both empty', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    const job = resume.experience[0];
    if (!job) throw new Error('fixture changed');
    job.company = '';
    job.location = '';

    expect(texFor(resume)).not.toContain('\\hfill \\par');
  });

  it('still escapes user text (no raw LaTeX gets through)', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.skills = [{ id: 'skills0', category: '\\input{x}', items: ['C#', '50%'] }];
    const tex = texFor(resume);

    expect(tex).not.toContain('\\input{x}');
    expect(tex).toContain('C\\#');
    expect(tex).toContain('50\\%');
  });
});
