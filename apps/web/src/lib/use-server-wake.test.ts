import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useServerWake } from './use-server-wake.ts';

const FAST = { showWakingAfterMs: 20, retryEveryMs: 5, maxAttempts: 3 } as const;

describe('useServerWake', () => {
  it('goes straight to ready when the server answers quickly', async () => {
    const ping = () => Promise.resolve(true);
    const { result } = renderHook(() => useServerWake(ping, FAST));

    await waitFor(() => {
      expect(result.current).toBe('ready');
    });
  });

  it('shows "waking" while a slow server starts, then ready', async () => {
    // The fake server only answers when the test says so: no race against timers.
    let answer: (ok: boolean) => void = () => undefined;
    const ping = () =>
      new Promise<boolean>((resolve) => {
        answer = resolve;
      });
    const { result } = renderHook(() => useServerWake(ping, FAST));

    await waitFor(() => {
      expect(result.current).toBe('waking');
    });
    answer(true);
    await waitFor(() => {
      expect(result.current).toBe('ready');
    });
  });

  it('gives up as offline after the last attempt', async () => {
    const ping = () => Promise.resolve(false);
    const { result } = renderHook(() => useServerWake(ping, FAST));

    await waitFor(() => {
      expect(result.current).toBe('offline');
    });
  });
});
