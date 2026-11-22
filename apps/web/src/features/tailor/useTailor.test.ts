import { act, renderHook, waitFor } from '@testing-library/react';
import { useReducer } from 'react';
import {
  FICTIONAL_RESUME,
  TAILOR_LIMITS,
  type KeywordsResponse,
  type TailorResponse,
  type TailorSuggestion,
} from '@tailex/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-client.ts';
import { resumeReducer } from '../review/resume-reducer.ts';
import { useTailor, type TailorApi } from './useTailor.ts';

const ANALYSIS: KeywordsResponse = {
  matched: ['React'],
  missing: [
    {
      skill: 'Terraform',
      category: 'Cloud & DevOps',
      required: true,
      suggestedGroup: { groupId: 'skills2', label: 'Tools' },
    },
    {
      skill: 'Jest',
      category: 'Testing',
      required: false,
      suggestedGroup: { groupId: null, label: 'Testing' },
    },
  ],
  extra: ['SQL'],
  score: 33,
  jdSkillCount: 3,
};

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('fixture changed');
  return value;
}

const FIRST = must(FICTIONAL_RESUME.experience[0]?.bullets[0]);
const SECOND = must(FICTIONAL_RESUME.experience[0]?.bullets[1]);

const suggestion = (
  bullet: { id: string; text: string },
  overrides: Partial<TailorSuggestion> = {},
): TailorSuggestion => ({
  id: bullet.id,
  original: bullet.text,
  suggested: `${bullet.text.slice(0, -1)}, as requested.`,
  reason: 'Matches the job description.',
  status: 'ok',
  ...overrides,
});

const response = (...suggestions: TailorSuggestion[]): TailorResponse => ({
  suggestions,
  bulletsConsidered: 6,
  bulletsTotal: 6,
  ignored: 0,
});

function fakeApi(overrides: Partial<TailorApi> = {}) {
  const api: TailorApi = {
    keywords: vi.fn(() => Promise.resolve(ANALYSIS)),
    tailor: vi.fn(() => Promise.resolve(response(suggestion(FIRST), suggestion(SECOND)))),
    ...overrides,
  };
  return api;
}

/** The hook plus a real resume reducer, like App does. */
function setup(api: TailorApi) {
  return renderHook(() => {
    const [resume, dispatch] = useReducer(resumeReducer, FICTIONAL_RESUME);
    const tailor = useTailor({ resume, dispatch, api, refreshDelayMs: 0 });
    return { resume, dispatch, tailor };
  });
}

async function analyzed(api: TailorApi, jd = 'We need Terraform and Jest') {
  const hook = setup(api);
  act(() => {
    hook.result.current.tailor.setJd(jd);
  });
  await act(() => hook.result.current.tailor.analyze());
  return hook;
}

describe('useTailor: analyze', () => {
  it('analyzes the job description and keeps the first score as "before"', async () => {
    const api = fakeApi();

    const { result } = await analyzed(api);

    expect(api.keywords).toHaveBeenCalledWith(FICTIONAL_RESUME, 'We need Terraform and Jest');
    expect(result.current.tailor.analysis).toMatchObject({ baseline: ANALYSIS, current: ANALYSIS });
    expect(result.current.tailor.busy).toBe('idle');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   \n '],
  ])('refuses a job description that is %s, without calling the server', async (_name, jd) => {
    const api = fakeApi();
    const { result } = setup(api);
    act(() => {
      result.current.tailor.setJd(jd);
    });

    await act(() => result.current.tailor.analyze());

    expect(result.current.tailor.error).toBe('Paste a job description first.');
    expect(api.keywords).not.toHaveBeenCalled();
  });

  it('refuses a job description over the limit', async () => {
    const api = fakeApi();
    const { result } = setup(api);
    act(() => {
      result.current.tailor.setJd('x'.repeat(TAILOR_LIMITS.jdChars + 1));
    });

    await act(() => result.current.tailor.analyze());

    expect(result.current.tailor.error).toContain('longer than');
    expect(api.keywords).not.toHaveBeenCalled();
  });

  it('a double click sends one request', async () => {
    let finish: (value: KeywordsResponse) => void = () => undefined;
    const api = fakeApi({
      keywords: vi.fn(() => new Promise<KeywordsResponse>((resolve) => (finish = resolve))),
    });
    const { result } = setup(api);
    act(() => {
      result.current.tailor.setJd('Terraform');
    });

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.tailor.analyze();
    });
    await act(() => result.current.tailor.analyze()); // second click while busy
    await act(async () => {
      finish(ANALYSIS);
      await first;
    });

    expect(api.keywords).toHaveBeenCalledTimes(1);
  });

  it('shows a readable message when the server fails, and recovers', async () => {
    const api = fakeApi({ keywords: vi.fn(() => Promise.reject(new ApiError('NETWORK', 0))) });

    const { result } = await analyzed(api);

    expect(result.current.tailor.error).toContain('Could not reach the server');
    expect(result.current.tailor.busy).toBe('idle');
    expect(result.current.tailor.analysis).toBeNull();
  });

  it('a new job description starts fresh; the same one keeps its "before" score', async () => {
    const better = { ...ANALYSIS, score: 80 };
    const keywords = vi.fn().mockResolvedValueOnce(ANALYSIS).mockResolvedValue(better);
    const { result } = await analyzed(fakeApi({ keywords }), 'We need Terraform');

    act(() => {
      result.current.tailor.toggle('Terraform');
    });
    await act(() => result.current.tailor.analyze()); // same text again

    expect(result.current.tailor.analysis?.baseline.score).toBe(33); // kept
    expect(result.current.tailor.analysis?.current.score).toBe(80);
    expect(result.current.tailor.ticked).toEqual(['Terraform']);

    act(() => {
      result.current.tailor.setJd('A different job: Jest');
    });
    await act(() => result.current.tailor.analyze());

    expect(result.current.tailor.analysis?.baseline.score).toBe(80); // new baseline
    expect(result.current.tailor.ticked).toEqual([]); // old ticks are not about this job
  });

  it('knows when the text was edited after the analysis', async () => {
    const { result } = await analyzed(fakeApi());
    expect(result.current.tailor.jdChanged).toBe(false);

    act(() => {
      result.current.tailor.setJd('We need Terraform and Jest and more');
    });

    expect(result.current.tailor.jdChanged).toBe(true);
  });

  it('an answer that arrives after a reset is ignored', async () => {
    let finish: (value: KeywordsResponse) => void = () => undefined;
    const api = fakeApi({
      keywords: vi.fn(() => new Promise<KeywordsResponse>((resolve) => (finish = resolve))),
    });
    const { result } = setup(api);
    act(() => {
      result.current.tailor.setJd('Terraform');
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.tailor.analyze();
    });

    act(() => {
      result.current.tailor.reset();
    });
    await act(async () => {
      finish(ANALYSIS);
      await pending;
    });

    expect(result.current.tailor.analysis).toBeNull();
    expect(result.current.tailor.busy).toBe('idle');
  });
});

describe('useTailor: adding skills', () => {
  it('adds the ticked skills to the Skills section and remembers them as confirmed', async () => {
    const { result } = await analyzed(fakeApi());

    act(() => {
      result.current.tailor.toggle('Terraform');
      result.current.tailor.toggle('Jest');
    });
    act(() => {
      result.current.tailor.addTicked();
    });

    expect(result.current.resume.skills[2]?.items).toContain('Terraform');
    expect(result.current.resume.skills.at(-1)).toMatchObject({
      category: 'Testing',
      items: ['Jest'],
    });
    expect(result.current.tailor.confirmed).toEqual(['Terraform', 'Jest']);
    expect(result.current.tailor.ticked).toEqual([]);
    expect(result.current.tailor.notice).toContain('Added to Skills: Terraform, Jest.');
  });

  it('ticking twice unticks, and adding with nothing ticked changes nothing', async () => {
    const { result } = await analyzed(fakeApi());

    act(() => {
      result.current.tailor.toggle('Jest');
      result.current.tailor.toggle('Jest');
    });
    act(() => {
      result.current.tailor.addTicked();
    });

    expect(result.current.tailor.ticked).toEqual([]);
    expect(result.current.resume).toBe(FICTIONAL_RESUME);
  });

  it('re-scores the resume after the skills were added, so "after" is true', async () => {
    const after = { ...ANALYSIS, score: 100, missing: [] };
    const keywords = vi.fn().mockResolvedValueOnce(ANALYSIS).mockResolvedValue(after);
    const { result } = await analyzed(fakeApi({ keywords }));

    act(() => {
      result.current.tailor.toggle('Terraform');
    });
    act(() => {
      result.current.tailor.addTicked();
    });

    await waitFor(() => {
      expect(result.current.tailor.analysis?.current.score).toBe(100);
    });
    expect(result.current.tailor.analysis?.baseline.score).toBe(33); // "before" never moves
    expect(keywords).toHaveBeenLastCalledWith(result.current.resume, 'We need Terraform and Jest');
  });
});

describe('useTailor: suggestions', () => {
  it('asks the server with the confirmed skills and shows every suggestion as pending', async () => {
    const api = fakeApi();
    const { result } = await analyzed(api);
    act(() => {
      result.current.tailor.toggle('Terraform');
    });
    act(() => {
      result.current.tailor.addTicked();
    });

    await act(() => result.current.tailor.suggest());

    expect(api.tailor).toHaveBeenCalledWith(expect.anything(), 'We need Terraform and Jest', [
      'Terraform',
    ]);
    expect(result.current.tailor.suggestions.map((v) => v.decision)).toEqual([
      'pending',
      'pending',
    ]);
    expect(result.current.tailor.meta).toEqual({
      bulletsConsidered: 6,
      bulletsTotal: 6,
      ignored: 0,
    });
  });

  it('does nothing before an analysis, or when the text changed since', async () => {
    const api = fakeApi();
    const { result } = setup(api);
    await act(() => result.current.tailor.suggest());
    expect(api.tailor).not.toHaveBeenCalled();

    act(() => {
      result.current.tailor.setJd('Terraform');
    });
    await act(() => result.current.tailor.analyze());
    act(() => {
      result.current.tailor.setJd('Something else entirely');
    });
    await act(() => result.current.tailor.suggest());
    expect(api.tailor).not.toHaveBeenCalled();
  });

  it('shows a readable error (for example no key) and keeps going', async () => {
    const api = fakeApi({ tailor: vi.fn(() => Promise.reject(new ApiError('KEY_MISSING', 0))) });
    const { result } = await analyzed(api);

    await act(() => result.current.tailor.suggest());

    expect(result.current.tailor.error).toContain('Add your API key first');
    expect(result.current.tailor.busy).toBe('idle');
  });

  it('accepting applies the rewrite to the right bullet and marks it accepted', async () => {
    const { result } = await analyzed(fakeApi());
    await act(() => result.current.tailor.suggest());
    const view = result.current.tailor.suggestions[0];
    if (!view) throw new Error('no suggestion');

    act(() => {
      result.current.tailor.accept(FIRST.id);
    });

    expect(result.current.resume.experience[0]?.bullets[0]?.text).toBe(view.suggestion.suggested);
    expect(result.current.resume.experience[0]?.bullets[1]?.text).toBe(SECOND.text); // others untouched
    expect(result.current.tailor.statusOf(viewAt(result.current.tailor.suggestions, 0))).toBe(
      'accepted',
    );
  });

  it('accepting twice changes nothing the second time', async () => {
    const { result } = await analyzed(fakeApi());
    await act(() => result.current.tailor.suggest());

    act(() => {
      result.current.tailor.accept(FIRST.id);
    });
    const afterFirst = result.current.resume;
    act(() => {
      result.current.tailor.accept(FIRST.id);
    });

    expect(result.current.resume).toBe(afterFirst);
  });

  it('a blocked suggestion cannot be accepted, and shows as blocked', async () => {
    const blocked = suggestion(FIRST, {
      status: 'blocked',
      blockedReason: 'Adds a skill: Docker.',
    });
    const { result } = await analyzed(
      fakeApi({ tailor: vi.fn(() => Promise.resolve(response(blocked))) }),
    );
    await act(() => result.current.tailor.suggest());

    act(() => {
      result.current.tailor.accept(FIRST.id);
    });

    expect(result.current.resume).toBe(FICTIONAL_RESUME);
    expect(result.current.tailor.statusOf(viewAt(result.current.tailor.suggestions, 0))).toBe(
      'blocked',
    );
  });

  it('a bullet edited after the rewrite arrived is outdated and cannot be accepted', async () => {
    const { result } = await analyzed(fakeApi());
    await act(() => result.current.tailor.suggest());
    act(() => {
      result.current.dispatch({
        type: 'setBullet',
        section: 'experience',
        entryId: 'exp0',
        id: FIRST.id,
        text: 'I edited this bullet by hand.',
      });
    });

    expect(result.current.tailor.statusOf(viewAt(result.current.tailor.suggestions, 0))).toBe(
      'outdated',
    );
    act(() => {
      result.current.tailor.accept(FIRST.id);
    });

    expect(result.current.resume.experience[0]?.bullets[0]?.text).toBe(
      'I edited this bullet by hand.',
    );
  });

  it('a deleted bullet makes its suggestion outdated', async () => {
    const { result } = await analyzed(fakeApi());
    await act(() => result.current.tailor.suggest());
    act(() => {
      result.current.dispatch({
        type: 'removeBullet',
        section: 'experience',
        entryId: 'exp0',
        id: FIRST.id,
      });
    });

    expect(result.current.tailor.statusOf(viewAt(result.current.tailor.suggestions, 0))).toBe(
      'outdated',
    );
    act(() => {
      result.current.tailor.accept(FIRST.id);
    });
    expect(findText(result.current.resume, FIRST.id)).toBeUndefined();
  });

  it('rejecting leaves the resume alone; accept-all applies only the ones that are ok and current', async () => {
    const third = FICTIONAL_RESUME.experience[1]?.bullets[0];
    if (!third) throw new Error('fixture changed');
    const api = fakeApi({
      tailor: vi.fn(() =>
        Promise.resolve(
          response(
            suggestion(FIRST),
            suggestion(SECOND, { status: 'blocked', blockedReason: 'Adds a number.' }),
            suggestion(third),
          ),
        ),
      ),
    });
    const { result } = await analyzed(api);
    await act(() => result.current.tailor.suggest());

    act(() => {
      result.current.tailor.reject(third.id);
    });
    expect(result.current.resume).toBe(FICTIONAL_RESUME);

    act(() => {
      result.current.tailor.acceptAll();
    });

    const texts = result.current.resume.experience.flatMap((e) => e.bullets.map((b) => b.text));
    expect(texts).toContain(`${FIRST.text.slice(0, -1)}, as requested.`); // accepted
    expect(texts).toContain(SECOND.text); // blocked: unchanged
    expect(texts).toContain(third.text); // rejected: unchanged
    expect(result.current.tailor.suggestions.map((v) => v.decision)).toEqual([
      'accepted',
      'pending',
      'rejected',
    ]);
  });

  it('an empty result is a normal answer', async () => {
    const api = fakeApi({ tailor: vi.fn(() => Promise.resolve(response())) });
    const { result } = await analyzed(api);

    await act(() => result.current.tailor.suggest());

    expect(result.current.tailor.suggestions).toEqual([]);
    expect(result.current.tailor.meta?.bulletsConsidered).toBe(6);
  });
});

function viewAt<T>(views: readonly T[], index: number): T {
  const view = views[index];
  if (view === undefined) throw new Error('no suggestion at that position');
  return view;
}

function findText(resume: typeof FICTIONAL_RESUME, bulletId: string): string | undefined {
  return resume.experience.flatMap((e) => e.bullets).find((b) => b.id === bulletId)?.text;
}
