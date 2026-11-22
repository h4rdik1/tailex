/** The 5-step flow. Steps live in memory (no router, docs/DECISIONS.md ADR-017). */
export const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
  { id: 'preview', label: 'Preview' },
  { id: 'tailor', label: 'Tailor' },
  { id: 'export', label: 'Export' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export interface StepState {
  current: StepId;
  /** Index of the furthest step the user has unlocked; earlier steps can be revisited. */
  furthest: number;
}

export type StepAction =
  | { type: 'go'; step: StepId } // click a step in the stepper
  | { type: 'advance'; step: StepId }; // the app finished a step (e.g. parse done → review)

export const INITIAL_STEPS: StepState = { current: 'upload', furthest: 0 };

export function stepIndex(step: StepId): number {
  return STEPS.findIndex((s) => s.id === step);
}

/** Can the user open this step from the stepper right now? */
export function canVisit(state: StepState, step: StepId): boolean {
  return stepIndex(step) <= state.furthest;
}

export function stepsReducer(state: StepState, action: StepAction): StepState {
  switch (action.type) {
    case 'go':
      return canVisit(state, action.step) ? { ...state, current: action.step } : state;
    case 'advance':
      return {
        current: action.step,
        furthest: Math.max(state.furthest, stepIndex(action.step)),
      };
  }
}
