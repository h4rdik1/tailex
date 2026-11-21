import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layout, ResumeData } from '@tailex/shared';
import { ApiError, type RenderedPdf } from '../../lib/api-client.ts';

export type RenderState =
  | { status: 'idle' }
  | { status: 'rendering' }
  | {
      status: 'ready';
      url: string;
      pageCount: number;
      droppedChars: string[];
      /** The layout the server picked, and how full the page is (0–1); null if unknown. */
      layout: Layout | null;
      fill: number | null;
      /** The exact resume this PDF was built from (to show "out of date"). */
      source: ResumeData;
    }
  | { status: 'error'; error: ApiError };

export interface RenderOptions {
  /** Wait before the single retry after a 503 BUSY (the PDF builder had no free slot). */
  busyRetryMs: number;
}

const DEFAULT_OPTIONS: RenderOptions = { busyRetryMs: 1_500 };

/**
 * Builds the PDF on the server and shows it from a `blob:` URL (allowed by our CSP for the
 * preview only). Each new PDF revokes the previous URL so old PDFs don't pile up in memory.
 */
export function usePdfRender(
  renderPdf: (resume: ResumeData) => Promise<RenderedPdf>,
  options: RenderOptions = DEFAULT_OPTIONS,
): { state: RenderState; render: (resume: ResumeData) => Promise<void> } {
  const [state, setState] = useState<RenderState>({ status: 'idle' });
  const currentUrl = useRef<string | null>(null);
  // Only the newest request may update the screen; an older, slower answer is ignored.
  const latestRequest = useRef(0);

  useEffect(() => {
    return () => {
      if (currentUrl.current !== null) URL.revokeObjectURL(currentUrl.current);
    };
  }, []);

  const render = useCallback(
    async (resume: ResumeData): Promise<void> => {
      const request = ++latestRequest.current;
      setState({ status: 'rendering' });
      try {
        const result = await renderWithBusyRetry(renderPdf, resume, options.busyRetryMs);
        if (request !== latestRequest.current) return;
        const url = URL.createObjectURL(result.pdf);
        if (currentUrl.current !== null) URL.revokeObjectURL(currentUrl.current);
        currentUrl.current = url;
        setState({
          status: 'ready',
          url,
          pageCount: result.pageCount,
          droppedChars: result.droppedChars,
          layout: result.layout,
          fill: result.fill,
          source: resume,
        });
      } catch (error) {
        if (request !== latestRequest.current) return;
        setState({
          status: 'error',
          error: error instanceof ApiError ? error : new ApiError('BAD_RESPONSE', 0),
        });
      }
    },
    [renderPdf, options.busyRetryMs],
  );

  return { state, render };
}

async function renderWithBusyRetry(
  renderPdf: (resume: ResumeData) => Promise<RenderedPdf>,
  resume: ResumeData,
  retryMs: number,
): Promise<RenderedPdf> {
  try {
    return await renderPdf(resume);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'BUSY') throw error;
    await new Promise((resolve) => setTimeout(resolve, retryMs));
    return renderPdf(resume); // one retry only, then the error is shown
  }
}
