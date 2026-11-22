import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KEEP_ALIVE_INTERVAL_MS,
  parseKeepAliveUrl,
  pingOnce,
  startKeepAlive,
} from '../src/services/keep-alive.ts';

describe('parseKeepAliveUrl', () => {
  it('accepts an https URL', () => {
    expect(parseKeepAliveUrl('https://tailex.example.org/api/health')).toBe(
      'https://tailex.example.org/api/health',
    );
  });

  it('rejects a value that is not a URL', () => {
    expect(() => parseKeepAliveUrl('not a url')).toThrow('absolute URL');
  });

  it('rejects non-http schemes', () => {
    expect(() => parseKeepAliveUrl('file:///etc/passwd')).toThrow('http or https');
  });
});

describe('pingOnce', () => {
  it('reports true for a 2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await expect(pingOnce('https://x.test/api/health', fetchImpl)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('https://x.test/api/health');
  });

  it('reports false instead of throwing when the network fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(pingOnce('https://x.test/api/health', fetchImpl)).resolves.toBe(false);
  });
});

describe('startKeepAlive', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pings the URL every 15 seconds until stopped', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const timer = startKeepAlive('https://x.test/api/health', fetchImpl);
    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_INTERVAL_MS * 3);
    clearInterval(timer);

    expect(KEEP_ALIVE_INTERVAL_MS).toBe(15_000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
