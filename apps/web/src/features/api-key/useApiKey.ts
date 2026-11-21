import { PublicProviderSchema, type PublicProvider } from '@tailex/shared';
import { useState } from 'react';

export const KEY_STORAGE_NAME = 'tailex:llm-key';

export type KeyStatus = 'none' | 'in-memory' | 'remembered';

export interface ApiKeyState {
  key: string;
  provider: PublicProvider;
  remember: boolean;
  status: KeyStatus;
  setKey(key: string): void;
  setProvider(provider: PublicProvider): void;
  setRemember(remember: boolean): void;
  clear(): void;
}

/** What we keep in localStorage when "Remember on this device" is ticked. */
interface StoredKey {
  provider: PublicProvider;
  key: string;
}

const DEFAULT_PROVIDER: PublicProvider = 'gemini';

function writeStored(provider: PublicProvider, key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE_NAME, JSON.stringify({ provider, key }));
  } catch {
    // Storage blocked (e.g. private mode): carry on in memory only.
  }
}

function removeStored(): void {
  try {
    localStorage.removeItem(KEY_STORAGE_NAME);
  } catch {
    // Same: never crash because of storage.
  }
}

/** Turns the stored text back into { provider, key }, or null if it is broken in any way. */
function parseStored(raw: string): StoredKey | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null; // not JSON
  }
  if (typeof value !== 'object' || value === null) return null;

  const { provider, key } = value as Record<string, unknown>;
  const checkedProvider = PublicProviderSchema.safeParse(provider);
  if (!checkedProvider.success) return null; // missing or unknown provider
  if (typeof key !== 'string' || key.trim() === '') return null; // missing or empty key

  return { provider: checkedProvider.data, key: key.trim() };
}

/** Reads the remembered key on page load. A broken entry is removed so it can't cause trouble later. */
function readStored(): StoredKey | null {
  try {
    const raw = localStorage.getItem(KEY_STORAGE_NAME);
    if (raw === null) return null;
    const stored = parseStored(raw);
    if (stored === null) removeStored();
    return stored;
  } catch {
    return null; // storage blocked: start with nothing
  }
}

export function useApiKey(): ApiKeyState {
  // Passing the function (not calling it) makes React read storage once, on the first render only.
  const [initial] = useState(readStored);
  const [key, setKeyState] = useState(initial?.key ?? '');
  const [provider, setProviderState] = useState<PublicProvider>(
    initial?.provider ?? DEFAULT_PROVIDER,
  );
  const [remember, setRememberState] = useState(initial !== null);

  // The one storage rule: save only when remember is on AND there is a key; otherwise remove.
  // It takes the NEW values as arguments because state updates only show up on the next render.
  function syncStorage(nextProvider: PublicProvider, nextKey: string, nextRemember: boolean): void {
    if (nextRemember && nextKey !== '') {
      writeStored(nextProvider, nextKey);
    } else {
      removeStored();
    }
  }

  function setKey(next: string): void {
    const trimmed = next.trim();
    setKeyState(trimmed);
    syncStorage(provider, trimmed, remember);
  }

  function setProvider(next: PublicProvider): void {
    setProviderState(next);
    syncStorage(next, key, remember);
  }

  function setRemember(next: boolean): void {
    setRememberState(next);
    syncStorage(provider, key, next);
  }

  function clear(): void {
    setKeyState('');
    setRememberState(false);
    removeStored();
  }

  const status: KeyStatus = key === '' ? 'none' : remember ? 'remembered' : 'in-memory';

  return { key, provider, remember, status, setKey, setProvider, setRemember, clear };
}
