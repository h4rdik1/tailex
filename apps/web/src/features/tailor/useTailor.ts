import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import {
  TAILOR_LIMITS,
  type KeywordsResponse,
  type ResumeData,
  type TailorResponse,
  type TailorSuggestion,
} from '@tailex/shared';
import { ApiError } from '../../lib/api-client.ts';
import { newId, type ResumeAction } from '../review/resume-reducer.ts';
import { findBullet, planSkillAdditions } from './apply-changes.ts';

/** The two server calls the Tailor step needs. Passed in, so tests (and sample mode) can fake them. */
export interface TailorApi {
  keywords: (resume: ResumeData, jd: string) => Promise<KeywordsResponse>;
  tailor: (resume: ResumeData, jd: string, confirmedSkills: string[]) => Promise<TailorResponse>;
}

export type Decision = 'pending' | 'accepted' | 'rejected';

export interface SuggestionView {
  suggestion: TailorSuggestion;
  decision: Decision;
}

/** What the card shows: the guard's verdict, or what the user did, or "the bullet changed since". */
export type SuggestionStatus = 'ok' | 'blocked' | 'outdated' | 'accepted' | 'rejected';

export interface Analysis {
  /** The (trimmed) job description this analysis is for. */
  jd: string;
  /** The first analysis of this job description: the "before" score stays put. */
  baseline: KeywordsResponse;
  /** The latest analysis of the CURRENT resume: the "after" score follows every edit. */
  current: KeywordsResponse;
  /** The resume object the `current` numbers were computed for. */
  resumeSeen: ResumeData;
}

export interface SuggestionMeta {
  bulletsConsidered: number;
  bulletsTotal: number;
  ignored: number;
}

export type Busy = 'idle' | 'analyzing' | 'suggesting';

export interface UseTailorOptions {
  resume: ResumeData;
  dispatch: Dispatch<ResumeAction>;
  api: TailorApi;
  /** Wait after an edit before re-scoring. Short, but not per keystroke. */
  refreshDelayMs?: number;
}

const DEFAULT_REFRESH_DELAY_MS = 400;

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

export function useTailor({
  resume,
  dispatch,
  api,
  refreshDelayMs = DEFAULT_REFRESH_DELAY_MS,
}: UseTailorOptions) {
  const [jd, setJdState] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const [confirmed, setConfirmed] = useState<readonly string[]>([]);
  const [suggestions, setSuggestions] = useState<readonly SuggestionView[]>([]);
  const [meta, setMeta] = useState<SuggestionMeta | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Only the newest request may update the screen; an older, slower answer is ignored.
  const latest = useRef(0);
  useEffect(
    () => () => {
      latest.current += 1; // leaving the page cancels what is in flight
    },
    [],
  );

  // After the user (or an Accept) changes the resume, re-score it so the "after" number is true.
  useEffect(() => {
    if (analysis === null || resume === analysis.resumeSeen) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .keywords(resume, analysis.jd)
        .then((current) => {
          if (cancelled) return;
          setAnalysis((now) =>
            now?.jd === analysis.jd ? { ...now, current, resumeSeen: resume } : now,
          );
        })
        .catch(() => {
          // Keep the old numbers; the next edit tries again.
        });
    }, refreshDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resume, analysis, api, refreshDelayMs]);

  const jdChanged = analysis !== null && jd.trim() !== analysis.jd;

  const setJd = useCallback((text: string) => {
    setJdState(text);
    setError(null);
  }, []);

  const analyze = useCallback(async (): Promise<void> => {
    if (busy !== 'idle') return; // a double click does nothing
    const text = jd.trim();
    if (text === '') {
      setError('Paste a job description first.');
      return;
    }
    if (text.length > TAILOR_LIMITS.jdChars) {
      setError(`The job description is longer than ${String(TAILOR_LIMITS.jdChars)} characters.`);
      return;
    }

    const id = ++latest.current;
    setBusy('analyzing');
    setError(null);
    setNotice(null);
    try {
      const result = await api.keywords(resume, text);
      if (id !== latest.current) return;
      const sameJd = analysis?.jd === text;
      setAnalysis({
        jd: text,
        baseline: sameJd ? analysis.baseline : result,
        current: result,
        resumeSeen: resume,
      });
      if (!sameJd) {
        // A different job description starts fresh: old ticks, skills and suggestions are not about it.
        setTicked([]);
        setConfirmed([]);
        setSuggestions([]);
        setMeta(null);
      }
    } catch (failure) {
      if (id === latest.current) setError(messageFor(failure));
    } finally {
      if (id === latest.current) setBusy('idle');
    }
  }, [analysis, api, busy, jd, resume]);

  const toggle = useCallback((skill: string) => {
    setTicked((now) => (now.includes(skill) ? now.filter((s) => s !== skill) : [...now, skill]));
  }, []);

  /** Adds the ticked skills to the Skills section: our code does it, the AI never sees them. */
  const addTicked = useCallback((): void => {
    if (analysis === null) return;
    const selected = analysis.current.missing.filter((m) => ticked.includes(m.skill));
    const plan = planSkillAdditions(resume, selected, newId);
    plan.actions.forEach(dispatch);
    setConfirmed((now) => [...new Set([...now, ...plan.added])]);
    setTicked([]);
    const parts: string[] = [];
    if (plan.added.length > 0) parts.push(`Added to Skills: ${plan.added.join(', ')}.`);
    if (plan.skipped.length > 0) {
      parts.push(`No room in Skills for: ${plan.skipped.join(', ')}. Add them by hand in Review.`);
    }
    setNotice(parts.length > 0 ? parts.join(' ') : 'Those skills were already on your resume.');
  }, [analysis, dispatch, resume, ticked]);

  const suggest = useCallback(async (): Promise<void> => {
    if (busy !== 'idle' || analysis === null || jdChanged) return;
    const id = ++latest.current;
    setBusy('suggesting');
    setError(null);
    setNotice(null);
    try {
      const result = await api.tailor(resume, analysis.jd, [...confirmed]);
      if (id !== latest.current) return;
      setSuggestions(result.suggestions.map((suggestion) => ({ suggestion, decision: 'pending' })));
      setMeta({
        bulletsConsidered: result.bulletsConsidered,
        bulletsTotal: result.bulletsTotal,
        ignored: result.ignored,
      });
    } catch (failure) {
      if (id === latest.current) setError(messageFor(failure));
    } finally {
      if (id === latest.current) setBusy('idle');
    }
  }, [analysis, api, busy, confirmed, jdChanged, resume]);

  /** The bullet changed (or was deleted) after the rewrite arrived: it can no longer be applied. */
  const isOutdated = useCallback(
    (view: SuggestionView): boolean => {
      const bullet = findBullet(resume, view.suggestion.id);
      return bullet === null || bullet.text !== view.suggestion.original;
    },
    [resume],
  );

  const statusOf = useCallback(
    (view: SuggestionView): SuggestionStatus => {
      if (view.decision !== 'pending') return view.decision;
      if (view.suggestion.status === 'blocked') return 'blocked';
      return isOutdated(view) ? 'outdated' : 'ok';
    },
    [isOutdated],
  );

  const decide = useCallback((id: string, decision: Decision): void => {
    setSuggestions((now) =>
      now.map((view) => (view.suggestion.id === id ? { ...view, decision } : view)),
    );
  }, []);

  const applyIfPossible = useCallback(
    (view: SuggestionView): boolean => {
      if (statusOf(view) !== 'ok') return false; // blocked, outdated, or already decided
      const bullet = findBullet(resume, view.suggestion.id);
      if (bullet === null) return false;
      dispatch({
        type: 'setBullet',
        section: bullet.section,
        entryId: bullet.entryId,
        id: bullet.id,
        text: view.suggestion.suggested,
      });
      return true;
    },
    [dispatch, resume, statusOf],
  );

  const accept = useCallback(
    (id: string): void => {
      const view = suggestions.find((candidate) => candidate.suggestion.id === id);
      if (view && applyIfPossible(view)) decide(id, 'accepted');
    },
    [applyIfPossible, decide, suggestions],
  );

  const reject = useCallback(
    (id: string): void => {
      const view = suggestions.find((candidate) => candidate.suggestion.id === id);
      if (view?.decision === 'pending') decide(id, 'rejected');
    },
    [decide, suggestions],
  );

  /** Accepts every suggestion that passed the truth guard and is still current. */
  const acceptAll = useCallback((): void => {
    const done = new Set<string>();
    for (const view of suggestions) if (applyIfPossible(view)) done.add(view.suggestion.id);
    setSuggestions((now) =>
      now.map((view) => (done.has(view.suggestion.id) ? { ...view, decision: 'accepted' } : view)),
    );
  }, [applyIfPossible, suggestions]);

  /** Starts over (a new resume was loaded). Anything still in flight is ignored. */
  const reset = useCallback((): void => {
    latest.current += 1;
    setJdState('');
    setAnalysis(null);
    setTicked([]);
    setConfirmed([]);
    setSuggestions([]);
    setMeta(null);
    setBusy('idle');
    setError(null);
    setNotice(null);
  }, []);

  return {
    jd,
    setJd,
    jdChanged,
    analysis,
    ticked,
    confirmed,
    suggestions,
    meta,
    busy,
    error,
    notice,
    analyze,
    toggle,
    addTicked,
    suggest,
    accept,
    reject,
    acceptAll,
    statusOf,
    reset,
  };
}

export type TailorController = ReturnType<typeof useTailor>;
