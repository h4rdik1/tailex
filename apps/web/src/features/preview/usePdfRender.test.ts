import { act, renderHook } from '@testing-library/react';
import { FICTIONAL_RESUME } from '@tailex/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type RenderedPdf } from '../../lib/api-client.ts';
import { usePdfRender } from './usePdfRender.ts';

const FAST = { busyRetryMs: 1 };

function pdfResult(pageCount = 1): RenderedPdf {
  return { pdf: new Blob(['%PDF-'], { type: 'application/pdf' }), pageCount, droppedChars: [] };
}

// jsdom has no blob URLs, so we provide simple fakes and count calls.
let urlCount = 0;
const revokeObjectURL = vi.fn();
beforeEach(() => {
  urlCount = 0;
  revokeObjectURL.mockClear();
  URL.createObjectURL = vi.fn(() => `blob:test/${String(++urlCount)}`);
  URL.revokeObjectURL = revokeObjectURL;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePdfRender', () => {
  it('renders and exposes the blob URL and page count', async () => {
    const renderPdf = vi.fn(() => Promise.resolve(pdfResult(2)));
    const { result } = renderHook(() => usePdfRender(renderPdf, FAST));

    await act(() => result.current.render(FICTIONAL_RESUME, 'normal'));

    expect(result.current.state).toMatchObject({
      status: 'ready',
      url: 'blob:test/1',
      pageCount: 2,
    });
    expect(renderPdf).toHaveBeenCalledWith(FICTIONAL_RESUME, 'normal');
  });

  it('revokes the previous URL when a new PDF arrives, and the last one on unmount', async () => {
    const renderPdf = vi.fn(() => Promise.resolve(pdfResult()));
    const { result, unmount } = renderHook(() => usePdfRender(renderPdf, FAST));

    await act(() => result.current.render(FICTIONAL_RESUME, 'normal'));
    await act(() => result.current.render(FICTIONAL_RESUME, 'tight'));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/1');

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/2');
  });

  it('retries once after BUSY', async () => {
    const renderPdf = vi
      .fn<() => Promise<RenderedPdf>>()
      .mockRejectedValueOnce(new ApiError('BUSY', 503))
      .mockResolvedValueOnce(pdfResult());
    const { result } = renderHook(() => usePdfRender(renderPdf, FAST));

    await act(() => result.current.render(FICTIONAL_RESUME, 'normal'));

    expect(renderPdf).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe('ready');
  });

  it('shows the error after a second BUSY (no endless retries)', async () => {
    const renderPdf = vi.fn(() => Promise.reject(new ApiError('BUSY', 503)));
    const { result } = renderHook(() => usePdfRender(renderPdf, FAST));

    await act(() => result.current.render(FICTIONAL_RESUME, 'normal'));

    expect(renderPdf).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({ status: 'error' });
  });

  it('does not retry other errors', async () => {
    const renderPdf = vi.fn(() => Promise.reject(new ApiError('COMPILE_FAILED', 422, [])));
    const { result } = renderHook(() => usePdfRender(renderPdf, FAST));

    await act(() => result.current.render(FICTIONAL_RESUME, 'normal'));

    expect(renderPdf).toHaveBeenCalledTimes(1);
    const { state } = result.current;
    expect(state.status === 'error' && state.error.code).toBe('COMPILE_FAILED');
  });

  it('ignores an older answer that arrives after a newer one', async () => {
    let finishFirst: (value: RenderedPdf) => void = () => undefined;
    const renderPdf = vi
      .fn<() => Promise<RenderedPdf>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(pdfResult(1));
    const { result } = renderHook(() => usePdfRender(renderPdf, FAST));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.render(FICTIONAL_RESUME, 'normal');
    });
    await act(() => result.current.render(FICTIONAL_RESUME, 'tight'));
    await act(async () => {
      finishFirst(pdfResult(5));
      await first;
    });

    expect(result.current.state).toMatchObject({ status: 'ready', pageCount: 1, spacing: 'tight' });
  });
});
