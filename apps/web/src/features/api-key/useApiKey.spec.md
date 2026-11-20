# Spec: `useApiKey` (owner-written)

File: `apps/web/src/features/api-key/useApiKey.ts`
Tests: `apps/web/src/features/api-key/useApiKey.test.ts`
Run: `npx vitest run apps/web/src/features/api-key`

## What it is

A React hook that holds the user's own LLM API key (BYOK) while they use Tailex. It is the single
source of truth for "which key, which provider, is it remembered". `App` calls it **once** and passes
the result down (to the key card) and into `api-client.ts` (which puts the key in a header).

## Rules (from CLAUDE.md, Security musts)

1. By default the key lives **only in memory** (React state). Reloading the page forgets it.
2. If the user ticks **"Remember on this device"**, the key is **also** saved in `localStorage`.
3. **"Clear key"** removes it from memory **and** from `localStorage`, and turns "remember" off.
4. On page load, the key is restored **only** if it was remembered.
5. **Never cookies.** (Cookies are sent to the server with every request; we don't want that.)
6. `localStorage` can **throw** (private browsing, blocked storage). The hook must never crash:
   wrap every storage call in `try/catch` and carry on in memory only.

## Shape

```ts
import type { PublicProvider } from '@tailex/shared';

export type KeyStatus = 'none' | 'in-memory' | 'remembered';

export interface ApiKeyState {
  key: string; // '' when there is no key
  provider: PublicProvider; // 'gemini' by default
  remember: boolean;
  status: KeyStatus; // derived, see below
  setKey(key: string): void;
  setProvider(provider: PublicProvider): void;
  setRemember(remember: boolean): void;
  clear(): void;
}

export function useApiKey(): ApiKeyState;
```

## Storage format

- One entry: key **`tailex:llm-key`**, value **`JSON.stringify({ provider, key })`**.
- Exported constant: `export const KEY_STORAGE_NAME = 'tailex:llm-key';`

## Behaviour, case by case

| Situation                                                                   | Result                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| First load, nothing stored                                                  | `key: ''`, `provider: 'gemini'`, `remember: false`, `status: 'none'`        |
| First load, a valid entry stored                                            | `key` and `provider` from storage, `remember: true`, `status: 'remembered'` |
| Stored value is broken (not JSON, wrong shape, unknown provider, empty key) | ignore it, **remove** it, start as "nothing stored"                         |
| `setKey('  abc  ')`                                                         | key becomes `'abc'` (**trimmed**: pasted keys often carry spaces/newlines)  |
| `setKey(x)` while remember is **off**                                       | memory only; storage untouched                                              |
| `setKey(x)` while remember is **on**                                        | memory **and** storage updated                                              |
| `setKey('')` while remember is on                                           | storage entry **removed** (never store an empty key)                        |
| `setRemember(true)` with a key                                              | save `{ provider, key }` to storage                                         |
| `setRemember(true)` with no key yet                                         | `remember` becomes true; nothing stored until a key is set                  |
| `setRemember(false)`                                                        | remove the storage entry; **keep** the key in memory                        |
| `setProvider(p)` while remember is on                                       | storage rewritten with the new provider                                     |
| `clear()`                                                                   | `key: ''`, `remember: false`, storage entry removed; provider unchanged     |
| any storage call throws                                                     | no crash; behave as memory-only                                             |

`status` is derived (don't store it): `key === ''` → `'none'`; else `remember` → `'remembered'`;
else `'in-memory'`. ("Verified" is shown by the key card after a successful test, not by this hook.)

## Suggested shape (≈ 50 lines)

- Three small helpers outside the hook: `readStored()`, `writeStored(provider, key)`,
  `removeStored()`, each with `try/catch`. `readStored` validates with
  `PublicProviderSchema` from `@tailex/shared`.
- Inside the hook: `useState` for `key`, `provider`, `remember`, initialised **lazily** from
  `readStored()` (pass a function to `useState`, so storage is read once, not on every render).
- Each setter updates state and then calls the right storage helper.

## Done when

- All tests in `useApiKey.test.ts` pass.
- `npm run lint` and `npm run typecheck` are clean.
- You can explain: why memory by default, why `try/catch` around storage, why no cookies,
  and why `App` calls the hook only once.
