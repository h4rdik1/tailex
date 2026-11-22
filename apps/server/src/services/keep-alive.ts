/**
 * Keeps a free Render instance awake. Render spins a free web service down after about 15 minutes
 * without INBOUND traffic, so this pings the public address of this same service every 15 seconds.
 *
 * The ping must go through the public URL (not localhost): only requests that come through the
 * platform's proxy count as traffic. The URL comes from the KEEP_ALIVE_URL environment variable, so
 * nothing runs unless it is set (local development is unaffected).
 */
export const KEEP_ALIVE_INTERVAL_MS = 15_000;

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number }>;

/** Throws if the value is not an absolute http(s) URL. The URL is ours (from the environment), never the client's. */
export function parseKeepAliveUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('KEEP_ALIVE_URL must be an absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('KEEP_ALIVE_URL must use http or https');
  }
  return parsed.toString();
}

/** One ping. Never throws: a failed ping only means the next one may succeed. */
export async function pingOnce(url: string, fetchImpl: FetchLike): Promise<boolean> {
  try {
    const response = await fetchImpl(url);
    return response.ok;
  } catch {
    return false;
  }
}

/** Starts the repeating ping. Returns the timer so tests (or a shutdown hook) can stop it. */
export function startKeepAlive(
  url: string,
  fetchImpl: FetchLike = (target) => fetch(target),
  intervalMs = KEEP_ALIVE_INTERVAL_MS,
): NodeJS.Timeout {
  return setInterval(() => {
    void pingOnce(url, fetchImpl).then((ok) => {
      if (!ok) {
        console.warn('Keep-alive ping failed');
      }
    });
  }, intervalMs);
}
