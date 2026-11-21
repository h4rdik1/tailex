import { useId, useRef, useState, type DragEvent } from 'react';
import { FileUp, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { FieldError, Hint } from '../../components/ui/fields.tsx';
import { cn } from '../../lib/cn.ts';
import { checkFile } from './check-file.ts';

interface UploadStepProps {
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onSample: () => void;
}

/** Step 1: pick or drop a PDF/DOCX, or load the fictional sample (no key, no LLM call). */
export function UploadStep({ busy, error, onFile, onSample }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const hintId = useId();

  function accept(file: File | undefined): void {
    if (!file) return;
    const problem = checkFile(file);
    setLocalError(problem);
    if (problem === null) onFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    if (!busy) accept(event.dataTransfer.files[0]);
  }

  const shownError = localError ?? error;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => {
              setDragging(false);
            }}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-10 text-center',
              dragging
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
                : 'border-zinc-300 dark:border-zinc-700',
            )}
          >
            <FileUp className="size-8 text-zinc-400" aria-hidden="true" />
            <p className="text-sm">Drop your resume here, or</p>
            <Button
              disabled={busy}
              aria-describedby={hintId}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? 'Reading your resume…' : 'Choose a file'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                accept(event.target.files?.[0]);
                event.target.value = ''; // so choosing the same file again still triggers
              }}
            />
            <Hint id={hintId}>PDF or DOCX, up to 1 MB. Text-based files only (no scans).</Hint>
          </div>
          {shownError !== null && <FieldError className="mt-3">{shownError}</FieldError>}
        </CardContent>
      </Card>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Your resume text, with contact details removed, is sent to your chosen AI provider using
        your key. We store nothing.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={busy} onClick={onSample}>
          <Sparkles className="size-4" aria-hidden="true" />
          Try with a sample resume
        </Button>
        <Hint>No key needed. Uses a fictional person.</Hint>
      </div>
    </div>
  );
}
