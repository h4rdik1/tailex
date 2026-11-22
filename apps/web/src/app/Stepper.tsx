import { cn } from '../lib/cn.ts';
import { canVisit, STEPS, type StepId, type StepState } from './steps.ts';

interface StepperProps {
  state: StepState;
  onGo: (step: StepId) => void;
}

/**
 * The step bar. Each reachable step is a real <button>, so Tab/Enter/Space work with no extra
 * code; the current one has aria-current="step" so screen readers announce where you are.
 */
export function Stepper({ state, onGo }: StepperProps) {
  return (
    <nav aria-label="Progress">
      <ol className="flex flex-wrap gap-2 font-mono text-sm">
        {STEPS.map((step, index) => {
          const isCurrent = step.id === state.current;
          const reachable = canVisit(state, step.id);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => {
                  onGo(step.id);
                }}
                disabled={!reachable}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'rounded-md border px-3 py-1.5',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500',
                  isCurrent
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100'
                    : 'border-zinc-200 dark:border-zinc-800',
                  !reachable && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="text-emerald-600 dark:text-emerald-400">{index + 1}</span>{' '}
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
