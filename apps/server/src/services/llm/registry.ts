import type { LlmProvider, ProviderName } from './types.ts';

/**
 * The provider allowlist (docs/SECURITY.md T6). The client sends only a NAME; we look it up here.
 * Unknown names, URLs or anything else return null, and the request is rejected with 400.
 * "mock" exists only outside production.
 */
export interface ProviderRegistry {
  get(name: string): LlmProvider | null;
}

export function createProviderRegistry(
  providers: Partial<Record<ProviderName, LlmProvider>>,
  options: { allowMock: boolean },
): ProviderRegistry {
  return {
    get(name) {
      if (!isProviderName(name)) return null;
      if (name === 'mock' && !options.allowMock) return null;
      return providers[name] ?? null;
    },
  };
}

function isProviderName(name: string): name is ProviderName {
  return name === 'gemini' || name === 'mock';
}
