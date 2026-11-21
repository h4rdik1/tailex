import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import type { Spacing } from '@tailex/shared';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { Badge } from '../../components/ui/misc.tsx';
import type { RenderState } from './usePdfRender.ts';

export const PDF_FILE_NAME = 'resume.pdf';

interface PdfPanelProps {
  state: RenderState;
  outOfDate: boolean;
  /** Schema problems block rendering: the server would reject the request anyway. */
  blocked: boolean;
  onRender: (spacing: Spacing) => void;
}

/** The PDF side of the preview: build button, warnings, errors and the PDF itself. */
export function PdfPanel({ state, outOfDate, blocked, onRender }: PdfPanelProps) {
  const spacing: Spacing = state.status === 'ready' ? state.spacing : 'normal';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={blocked || state.status === 'rendering'}
          onClick={() => {
            onRender(spacing);
          }}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {state.status === 'idle' ? 'Build PDF' : 'Update preview'}
        </Button>
        {outOfDate && state.status === 'ready' && <Badge tone="warning">Out of date</Badge>}
        {state.status === 'ready' && (
          <Badge tone={state.pageCount === 1 ? 'success' : 'warning'}>
            {state.pageCount === 1 ? '1 page' : `${String(state.pageCount)} pages`}
          </Badge>
        )}
      </div>

      <div aria-live="polite" className="sr-only">
        {state.status === 'rendering' && 'Building your PDF.'}
        {state.status === 'ready' && 'PDF ready.'}
        {state.status === 'error' && 'The PDF could not be built.'}
      </div>

      {blocked && (
        <p className="text-sm text-red-700 dark:text-red-400">
          Fix the problems listed above, then build the PDF.
        </p>
      )}

      {state.status === 'idle' && !blocked && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Build the PDF to see your one-page resume.
        </p>
      )}

      {state.status === 'rendering' && (
        <div
          aria-busy="true"
          className="aspect-[1/1.294] w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800"
        />
      )}

      {state.status === 'error' && (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="pt-4 text-sm">
            <p className="font-semibold text-red-700 dark:text-red-400">{state.error.message}</p>
            {state.error.compileErrors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 font-mono text-xs">
                {state.error.compileErrors.map((detail, index) => (
                  <li key={index}>
                    {detail.line !== null && `Line ${String(detail.line)}: `}
                    {detail.message}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {state.status === 'ready' && (
        <>
          {state.pageCount > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <span>Your resume is longer than one page.</span>
              {state.spacing === 'normal' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onRender('tight');
                  }}
                >
                  Tighten spacing
                </Button>
              ) : (
                <span>Try shortening or removing some bullets.</span>
              )}
            </div>
          )}
          {state.droppedChars.length > 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              These characters can&apos;t be printed in the PDF and were left out:{' '}
              <span className="font-mono">{state.droppedChars.join(' ')}</span>
            </p>
          )}
          <iframe
            title="Resume PDF preview"
            src={state.url}
            className="aspect-[1/1.294] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
          />
          <PdfLinks url={state.url} />
        </>
      )}
    </div>
  );
}

/** Download plus "Open PDF": some mobile browsers (e.g. iOS Safari) can't show a PDF in a frame. */
export function PdfLinks({ url }: { url: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild>
        <a href={url} download={PDF_FILE_NAME}>
          <Download className="size-4" aria-hidden="true" />
          Download PDF
        </a>
      </Button>
      <Button asChild variant="secondary">
        <a href={url} target="_blank" rel="noreferrer noopener">
          <ExternalLink className="size-4" aria-hidden="true" />
          Open PDF
        </a>
      </Button>
    </div>
  );
}
