import { useMemo, useReducer, useState } from 'react';
import { StepHeading } from './app/StepHeading.tsx';
import { Stepper } from './app/Stepper.tsx';
import { INITIAL_STEPS, stepsReducer, type StepId } from './app/steps.ts';
import { ThemeSelect } from './app/ThemeSelect.tsx';
import { Button } from './components/ui/button.tsx';
import { KeyCard } from './features/api-key/KeyCard.tsx';
import { useApiKey } from './features/api-key/useApiKey.ts';
import { ExportStep } from './features/preview/ExportStep.tsx';
import { PdfPanel } from './features/preview/PdfPanel.tsx';
import { PreviewStep } from './features/preview/PreviewStep.tsx';
import { usePdfRender } from './features/preview/usePdfRender.ts';
import { findPlaceholders, findProblems } from './features/review/check-resume.ts';
import { ReviewChecks } from './features/review/ReviewChecks.tsx';
import { ReviewForm } from './features/review/ReviewForm.tsx';
import { EMPTY_RESUME, resumeReducer } from './features/review/resume-reducer.ts';
import { SAMPLE_REDACTED_PREVIEW, SAMPLE_RESUME } from './features/sample/sample-data.ts';
import { SeeWhatsSent } from './features/upload/SeeWhatsSent.tsx';
import { UploadStep } from './features/upload/UploadStep.tsx';
import { ApiError, createApiClient } from './lib/api-client.ts';
import { useServerWake } from './lib/use-server-wake.ts';

/** Health checks need no key, so this client never sees one. Created once, outside React. */
const keylessClient = createApiClient({ getKey: () => '', getProvider: () => 'gemini' });
const pingServer = (): Promise<boolean> => keylessClient.health();

const STEP_TITLES: Record<StepId, string> = {
  upload: 'Upload your resume',
  review: 'Review and edit',
  preview: 'Preview',
  tailor: 'Tailor to a job',
  export: 'Download',
};

export function App() {
  // The key lives here, once, and flows down: one source of truth (useApiKey.spec.md).
  const apiKey = useApiKey();
  const api = useMemo(
    () => createApiClient({ getKey: () => apiKey.key, getProvider: () => apiKey.provider }),
    [apiKey.key, apiKey.provider],
  );
  const server = useServerWake(pingServer);

  const [steps, dispatchStep] = useReducer(stepsReducer, INITIAL_STEPS);
  const [resume, dispatchResume] = useReducer(resumeReducer, EMPTY_RESUME);
  const [sent, setSent] = useState<{ text: string; isSample: boolean } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { state: pdf, render } = usePdfRender(api.render);

  const problems = useMemo(() => findProblems(resume), [resume]);
  const placeholders = useMemo(() => findPlaceholders(resume), [resume]);
  // The reducer returns a new object on every edit, so "same object" means "no edits since".
  const outOfDate = pdf.status === 'ready' && pdf.source !== resume;

  async function parseFile(file: File): Promise<void> {
    setParsing(true);
    setUploadError(null);
    try {
      const result = await api.parse(file);
      dispatchResume({ type: 'replace', resume: result.resume });
      setSent({ text: result.redactedPreview, isSample: false });
      dispatchStep({ type: 'advance', step: 'review' });
    } catch (error) {
      setUploadError(error instanceof ApiError ? error.message : 'Something went wrong.');
    } finally {
      setParsing(false);
    }
  }

  function loadSample(): void {
    setUploadError(null);
    dispatchResume({ type: 'replace', resume: SAMPLE_RESUME });
    setSent({ text: SAMPLE_REDACTED_PREVIEW, isSample: true });
    dispatchStep({ type: 'advance', step: 'review' });
  }

  function goToPreview(): void {
    dispatchStep({ type: 'advance', step: 'preview' });
    if (pdf.status !== 'ready' || outOfDate) void render(resume);
  }

  const editor = (
    <div className="flex flex-col gap-4">
      <ReviewChecks problems={problems} placeholders={placeholders} />
      <ReviewForm resume={resume} dispatch={dispatchResume} />
    </div>
  );

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-white focus:p-2 dark:focus:bg-zinc-900"
      >
        Skip to content
      </a>
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <p className="font-mono text-lg font-semibold">
            tail<span className="text-emerald-600 dark:text-emerald-400">ex</span>
          </p>
          <ThemeSelect />
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <ServerNotice state={server} />
        <KeyCard apiKey={apiKey} testKey={api.testKey} />
        <Stepper
          state={steps}
          onGo={(step) => {
            dispatchStep({ type: 'go', step });
          }}
        />

        <section aria-labelledby="step-heading" className="flex flex-col gap-4">
          <StepHeading id="step-heading" focusOnMount={steps.furthest > 0} key={steps.current}>
            {STEP_TITLES[steps.current]}
          </StepHeading>

          {steps.current === 'upload' && (
            <UploadStep
              busy={parsing}
              error={uploadError}
              onFile={(file) => {
                void parseFile(file);
              }}
              onSample={loadSample}
            />
          )}

          {steps.current === 'review' && (
            <>
              {sent && <SeeWhatsSent text={sent.text} isSample={sent.isSample} />}
              {editor}
              <div>
                <Button disabled={problems.length > 0} onClick={goToPreview}>
                  Preview PDF
                </Button>
              </div>
            </>
          )}

          {steps.current === 'preview' && (
            <>
              <PreviewStep
                editor={editor}
                pdf={
                  <PdfPanel
                    state={pdf}
                    outOfDate={outOfDate}
                    blocked={problems.length > 0}
                    onRender={() => {
                      void render(resume);
                    }}
                  />
                }
              />
              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    dispatchStep({ type: 'advance', step: 'export' });
                  }}
                >
                  Continue to download
                </Button>
              </div>
            </>
          )}

          {steps.current === 'export' && (
            <ExportStep
              state={pdf}
              outOfDate={outOfDate}
              onRender={() => {
                void render(resume);
              }}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function ServerNotice({ state }: { state: ReturnType<typeof useServerWake> }) {
  if (state === 'waking') {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        Waking up the server… this takes a few seconds after a quiet period.
      </p>
    );
  }
  if (state === 'offline') {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        The server is not answering. Please reload the page in a minute.
      </p>
    );
  }
  return null;
}
