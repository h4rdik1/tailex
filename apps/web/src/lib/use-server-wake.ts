import { useEffect, useState } from 'react';

/**
 * Cloud Run scales to zero, so the first visit may hit a sleeping server (a "cold start" of a few
 * seconds). We ping /api/health on load: a quick answer shows nothing; a slow one shows
 * "Waking up the server…"; no answer after all retries shows "offline".
 */
export type ServerState = 'checking' | 'waking' | 'ready' | 'offline';

export interface WakeTiming {
  showWakingAfterMs: number;
  retryEveryMs: number;
  maxAttempts: number;
}

export const WAKE_TIMING: WakeTiming = {
  showWakingAfterMs: 1_500,
  retryEveryMs: 2_000,
  maxAttempts: 20,
};

export function useServerWake(
  ping: () => Promise<boolean>,
  timing: WakeTiming = WAKE_TIMING,
): ServerState {
  const [state, setState] = useState<ServerState>('checking');

  useEffect(() => {
    // An object (not a plain boolean) so the async loop always reads the latest value after
    // the component unmounts; then we stop and never call setState on an unmounted component.
    const run = { cancelled: false };
    const wakingTimer = setTimeout(() => {
      if (!run.cancelled) setState((current) => (current === 'checking' ? 'waking' : current));
    }, timing.showWakingAfterMs);

    async function poll(): Promise<void> {
      for (let attempt = 1; attempt <= timing.maxAttempts; attempt += 1) {
        const ok = await ping();
        if (run.cancelled) return;
        if (ok) {
          setState('ready');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, timing.retryEveryMs));
      }
      if (!run.cancelled) setState('offline');
    }
    void poll();

    return () => {
      run.cancelled = true;
      clearTimeout(wakingTimer);
    };
  }, [ping, timing]);

  return state;
}
