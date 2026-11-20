import type { PublicProvider } from '@tailex/shared';

/**
 * OWNER-WRITTEN (CLAUDE.md rule 6). Implement this against useApiKey.spec.md;
 * the tests in useApiKey.test.ts define "done". Until then this stub only lets the app load.
 */

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

function notImplemented(): never {
  throw new Error('useApiKey is not implemented yet (see useApiKey.spec.md)');
}

export function useApiKey(): ApiKeyState {
  return {
    key: '',
    provider: 'gemini',
    remember: false,
    status: 'none',
    setKey: notImplemented,
    setProvider: notImplemented,
    setRemember: notImplemented,
    clear: notImplemented,
  };
}
