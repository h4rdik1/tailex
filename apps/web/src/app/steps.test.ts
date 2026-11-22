import { describe, expect, it } from 'vitest';
import { canVisit, INITIAL_STEPS, stepsReducer } from './steps.ts';

describe('stepsReducer', () => {
  it('starts on Upload with nothing else unlocked', () => {
    expect(INITIAL_STEPS).toEqual({ current: 'upload', furthest: 0 });
    expect(canVisit(INITIAL_STEPS, 'review')).toBe(false);
  });

  it('advance moves forward and unlocks the step', () => {
    const state = stepsReducer(INITIAL_STEPS, { type: 'advance', step: 'review' });

    expect(state).toEqual({ current: 'review', furthest: 1 });
  });

  it('go can return to an earlier step without losing progress', () => {
    const atPreview = stepsReducer(INITIAL_STEPS, { type: 'advance', step: 'preview' });
    const back = stepsReducer(atPreview, { type: 'go', step: 'upload' });

    expect(back).toEqual({ current: 'upload', furthest: 2 });
    expect(stepsReducer(back, { type: 'go', step: 'preview' }).current).toBe('preview');
  });

  it('go ignores steps that are not unlocked yet', () => {
    expect(stepsReducer(INITIAL_STEPS, { type: 'go', step: 'export' })).toBe(INITIAL_STEPS);
  });

  // Phase 5 turned Tailor from "coming soon" into a real step, so this replaces the old rule
  // "Tailor can never be opened" with: it opens like any step, once it has been unlocked.
  it('lets you open Tailor once it is unlocked, and not before', () => {
    const atReview = stepsReducer(INITIAL_STEPS, { type: 'advance', step: 'review' });
    const atExport = stepsReducer(INITIAL_STEPS, { type: 'advance', step: 'export' });

    expect(canVisit(atReview, 'tailor')).toBe(false);
    expect(stepsReducer(atReview, { type: 'go', step: 'tailor' }).current).toBe('review');
    expect(canVisit(atExport, 'tailor')).toBe(true);
    expect(stepsReducer(atExport, { type: 'go', step: 'tailor' }).current).toBe('tailor');
  });
});
