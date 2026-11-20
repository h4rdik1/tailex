import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEY_STORAGE_NAME, useApiKey } from './useApiKey.ts';

const KEY = 'AIza-fake-test-key-000';

function stored(): unknown {
  const raw = localStorage.getItem(KEY_STORAGE_NAME);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

/** Simulates a page reload: a fresh hook instance reading whatever storage holds now. */
function reload() {
  return renderHook(() => useApiKey()).result;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useApiKey: defaults', () => {
  it('starts with no key, Gemini, remember off', () => {
    const { result } = renderHook(() => useApiKey());

    expect(result.current.key).toBe('');
    expect(result.current.provider).toBe('gemini');
    expect(result.current.remember).toBe(false);
    expect(result.current.status).toBe('none');
  });
});

describe('useApiKey: memory only (remember off)', () => {
  it('keeps the key in memory and never writes storage', () => {
    const { result } = renderHook(() => useApiKey());

    act(() => {
      result.current.setKey(KEY);
    });

    expect(result.current.key).toBe(KEY);
    expect(result.current.status).toBe('in-memory');
    expect(localStorage.getItem(KEY_STORAGE_NAME)).toBeNull();
  });

  it('trims spaces and newlines from a pasted key', () => {
    const { result } = renderHook(() => useApiKey());

    act(() => {
      result.current.setKey(`  ${KEY}\n`);
    });

    expect(result.current.key).toBe(KEY);
  });

  it('forgets the key on reload', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setKey(KEY);
    });

    expect(reload().current.key).toBe('');
  });
});

describe('useApiKey: remember on', () => {
  it('saves provider and key when remember is turned on', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setKey(KEY);
    });
    act(() => {
      result.current.setRemember(true);
    });

    expect(result.current.status).toBe('remembered');
    expect(stored()).toEqual({ provider: 'gemini', key: KEY });
  });

  it('saves a key typed after remember was turned on', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setRemember(true);
    });
    expect(localStorage.getItem(KEY_STORAGE_NAME)).toBeNull(); // nothing to save yet

    act(() => {
      result.current.setKey(KEY);
    });

    expect(stored()).toEqual({ provider: 'gemini', key: KEY });
  });

  it('restores a remembered key on reload', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setRemember(true);
    });
    act(() => {
      result.current.setKey(KEY);
    });

    const after = reload();
    expect(after.current.key).toBe(KEY);
    expect(after.current.remember).toBe(true);
    expect(after.current.status).toBe('remembered');
  });

  it('never stores an empty key', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setRemember(true);
    });
    act(() => {
      result.current.setKey(KEY);
    });
    act(() => {
      result.current.setKey('');
    });

    expect(localStorage.getItem(KEY_STORAGE_NAME)).toBeNull();
    expect(result.current.status).toBe('none');
  });

  it('turning remember off removes storage but keeps the key in memory', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setKey(KEY);
    });
    act(() => {
      result.current.setRemember(true);
    });
    act(() => {
      result.current.setRemember(false);
    });

    expect(localStorage.getItem(KEY_STORAGE_NAME)).toBeNull();
    expect(result.current.key).toBe(KEY);
    expect(result.current.status).toBe('in-memory');
  });

  it('rewrites storage when the provider changes', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setKey(KEY);
    });
    act(() => {
      result.current.setRemember(true);
    });
    act(() => {
      result.current.setProvider('gemini');
    });

    expect(stored()).toEqual({ provider: 'gemini', key: KEY });
  });
});

describe('useApiKey: clear', () => {
  it('wipes memory and storage and turns remember off', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setKey(KEY);
    });
    act(() => {
      result.current.setRemember(true);
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.key).toBe('');
    expect(result.current.remember).toBe(false);
    expect(result.current.status).toBe('none');
    expect(localStorage.getItem(KEY_STORAGE_NAME)).toBeNull();
    expect(reload().current.key).toBe('');
  });
});

describe('useApiKey: broken or unavailable storage', () => {
  it.each([
    ['not JSON', 'not json'],
    ['wrong shape', JSON.stringify({ apiKey: KEY })],
    ['unknown provider', JSON.stringify({ provider: 'openai', key: KEY })],
    ['empty key', JSON.stringify({ provider: 'gemini', key: '' })],
  ])('ignores and removes a stored value that is %s', (_name, value) => {
    localStorage.setItem(KEY_STORAGE_NAME, value);

    const { result } = renderHook(() => useApiKey());

    expect(result.current.key).toBe('');
    expect(result.current.remember).toBe(false);
    expect(localStorage.getItem(KEY_STORAGE_NAME)).toBeNull();
  });

  it('keeps working in memory when storage throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setKey(KEY);
    });
    act(() => {
      result.current.setRemember(true);
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.key).toBe('');
  });
});

describe('useApiKey: never cookies', () => {
  it('does not touch document.cookie', () => {
    const { result } = renderHook(() => useApiKey());
    act(() => {
      result.current.setKey(KEY);
    });
    act(() => {
      result.current.setRemember(true);
    });

    expect(document.cookie).toBe('');
  });
});
