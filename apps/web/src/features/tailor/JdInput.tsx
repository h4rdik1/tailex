import { useId } from 'react';
import { TAILOR_LIMITS } from '@tailex/shared';
import { Button } from '../../components/ui/button.tsx';
import { Hint, Label, Textarea } from '../../components/ui/fields.tsx';

interface JdInputProps {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  busy: boolean;
  /** Marks the box invalid for assistive technology; the message itself is shown by the step. */
  invalid: boolean;
}

/**
 * The paste box. The limit is shown, not enforced by the browser, so a long paste is never
 * silently cut: the counter turns red and Analyze explains the problem.
 */
export function JdInput({ value, onChange, onAnalyze, busy, invalid }: JdInputProps) {
  const id = useId();
  const hintId = useId();
  const length = value.trim().length;
  const over = length > TAILOR_LIMITS.jdChars;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Job description</Label>
      <Textarea
        id={id}
        rows={10}
        value={value}
        placeholder="Paste the job description here, especially the requirements section."
        aria-describedby={hintId}
        aria-invalid={over || invalid}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Hint id={hintId} className={over ? 'text-red-600 dark:text-red-400' : undefined}>
          {length.toLocaleString('en-US')} / {TAILOR_LIMITS.jdChars.toLocaleString('en-US')}{' '}
          characters. It is compared with your resume on our server, in code, with no AI.
        </Hint>
        <Button disabled={busy || over} onClick={onAnalyze}>
          {busy ? 'Analyzing…' : 'Analyze'}
        </Button>
      </div>
    </div>
  );
}
