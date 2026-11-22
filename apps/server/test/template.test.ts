import { describe, expect, it } from 'vitest';
import { FICTIONAL_RESUME, LAYOUT_LEVELS, type ResumeData } from '@tailex/shared';
import {
  layoutFor,
  REFERENCE_LEVEL,
  renderResumeTex,
  scaleFor,
  type TemplateOptions,
} from '../src/services/latex/template.ts';

const BASE: TemplateOptions = { layout: REFERENCE_LEVEL };

/** Only packages from the minimal TeX Live in the Docker image (ADR-020, ADR-036). */
const ALLOWED_PACKAGES = ['geometry', 'fontenc', 'lmodern', 'hyperref'];
const LEVELS = Array.from({ length: LAYOUT_LEVELS }, (_, i) => i + 1);

function texFor(resume: ResumeData = FICTIONAL_RESUME, options = BASE): string {
  return renderResumeTex(resume, options).tex;
}

describe('renderResumeTex: page setup', () => {
  it('uses US Letter, the reference margins at the reference level, and only allowed packages', () => {
    const tex = texFor();
    const packages = [...tex.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)].map((m) => m[1]);

    expect(tex).toContain('\\documentclass[letterpaper,10pt]{article}');
    expect(tex).toContain('letterpaper,top=0.4in,bottom=0.35in,left=0.45in,right=0.45in');
    expect(packages).toEqual(ALLOWED_PACKAGES);
  });

  it('never uses negative vertical space (the cause of overlapping lines)', () => {
    for (const layout of LEVELS) {
      expect(texFor(FICTIONAL_RESUME, { layout })).not.toMatch(/\\vspace\*?\{\s*-/);
    }
  });

  it('never stretches the page: the bottom stays ragged at every size', () => {
    for (const layout of LEVELS) {
      const tex = texFor(FICTIONAL_RESUME, { layout });
      expect(tex).toContain('\\raggedbottom');
      expect(tex).not.toContain('\\flushbottom');
    }
  });

  it('scales everything together: level 6 is the reference, each level is 2% bigger', () => {
    expect(scaleFor(REFERENCE_LEVEL)).toBe(1);
    expect(scaleFor(7)).toBeCloseTo(1.02);
    expect(scaleFor(1)).toBeCloseTo(0.9);
    expect(layoutFor(REFERENCE_LEVEL).baseFont).toBe('10}{12');
    expect(layoutFor(REFERENCE_LEVEL).itemFont).toBe('9.8}{12');
  });

  it('a higher level is bigger in every measurement', () => {
    const keys = ['baseFont', 'itemFont', 'nameFont', 'side', 'top', 'sectionAfter'] as const;
    for (let level = 2; level <= LAYOUT_LEVELS; level += 1) {
      const small = layoutFor(level - 1);
      const big = layoutFor(level);
      for (const key of keys) {
        expect(parseFloat(big[key])).toBeGreaterThan(parseFloat(small[key]));
      }
    }
  });

  it('keeps text readable and margins sane at both ends of the scale', () => {
    expect(parseFloat(layoutFor(1).itemFont)).toBeGreaterThanOrEqual(8.5);
    expect(parseFloat(layoutFor(LAYOUT_LEVELS).itemFont)).toBeLessThanOrEqual(12.5);
    expect(parseFloat(layoutFor(1).side)).toBeGreaterThanOrEqual(0.4);
  });

  it('writes the fill marker and the level', () => {
    const tex = texFor(FICTIONAL_RESUME, { layout: 9 });

    expect(tex).toContain('\\typeout{TAILEX-FILL \\the\\pagetotal\\space\\the\\pagegoal}');
    expect(tex.split('\n')[0]).toBe('% tailex-layout: 9');
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

  it('prints a single uncategorised skills group as one plain list, without a repeated label', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.skills = [
      { id: 'skills0', category: 'Skills', items: ['Pattern cutting', 'Hand sewing', 'Fitting'] },
    ];
    const tex = texFor(resume);

    expect(tex).toContain('Pattern cutting, Hand sewing, Fitting');
    expect(tex).not.toContain('\\textbf{Skills}');
  });

  it('puts uncategorised skills that are phrases on one line each, not in a comma list', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    resume.skills = [
      {
        id: 'skills0',
        category: 'Skills',
        items: [
          'Hand-sewing techniques for fine tailoring',
          'Luxury fabrics, including wool, silk',
        ],
      },
    ];
    const tex = texFor(resume);

    expect(tex).toContain(
      'Hand-sewing techniques for fine tailoring\\\\\nLuxury fabrics, including wool, silk',
    );
    expect(tex).not.toContain('tailoring, Luxury');
  });

  it('still labels real categories, even when several groups exist', () => {
    const tex = texFor();

    expect(tex).toContain('\\textbf{Languages}: ');
  });

  it('skips the company line when company and location are both empty', () => {
    const resume = structuredClone(FICTIONAL_RESUME);
    const job = resume.experience[0];
    if (!job) throw new Error('fixture changed');
    job.company = '';
    job.location = '';

    // An empty second line would start with \hfill (nothing on the left side).
    expect(texFor(resume)).not.toMatch(/^\\hfill /m);
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
