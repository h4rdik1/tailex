# TESTING — Tailex

## Ground rules

- **Fictional data only.** The repo is public: the sample resume and **all fixtures use fictional people only**. Never the owner's real name, phone, email, links or resume content.
- Never edit a test just to make it pass without explaining why in the PR/commit.
- Results are reported as real command output, never as "it should work".
- LLM calls are **never** made in tests. Use the `mock` provider.

## Layers and tools

| Layer                              | Tool                                               | Location                                                       |
| ---------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Unit (pure functions)              | Vitest                                             | `apps/server/src/**/*.test.ts`, `packages/shared/**/*.test.ts` |
| API / integration                  | Vitest + supertest                                 | `apps/server/test/api/*.test.ts`                               |
| Frontend units (hooks, components) | Vitest + jsdom (+ Testing Library, to be approved) | `apps/web/src/**/*.test.ts(x)`                                 |
| End to end                         | Playwright (1 test, sample mode, LLM mocked)       | `e2e/sample-mode.spec.ts`                                      |

## Required tests

| Area                                                               | Cases                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **escapeLatex**                                                    | every special char `& % $ # _ { } ~ ^ \`; combinations; unicode passthrough; fuzz (random strings → compiles, no unescaped specials); injection payloads in bullets: `\input{/etc/passwd}`, `\write18{…}`, `\immediate\write18`, `\catcode`, `^^5c` |
| **Compile service**                                                | valid render → 1-page PDF; overflow → page count > 1 + warning; **timeout** kills the process tree; temp dir deleted on success **and** failure; log parsed into `{line, message}`; **concurrency cap** returns `503 BUSY`                          |
| **Schema validation**                                              | mock provider returns: valid JSON, malformed JSON, wrong types, extra fields, oversized strings → retry once → `PARSE_INVALID_OUTPUT`                                                                                                               |
| **Ids**                                                            | stable and unique after parsing; tailor suggestions with unknown ids are rejected                                                                                                                                                                   |
| **Truth guard**                                                    | rejects fabricated skills, tools, employers, numbers, percentages; allows rephrasing and user-confirmed skills; blocked items carry a reason                                                                                                        |
| **PII redaction**                                                  | emails, phones (Indian + international formats), URLs, LinkedIn/GitHub handles, name guess; re-insertion at render                                                                                                                                  |
| **Keyword engine**                                                 | real (anonymized) JD fixtures; aliases; `C++`, `.NET`, `Node.js`, `C#`; required vs nice-to-have; score before/after                                                                                                                                |
| **Provider allowlist**                                             | fake provider name → 400; URL / host in the provider header → 400; no outbound call to non-allowlisted hosts                                                                                                                                        |
| **Key handling**                                                   | **log-capture test**: send a canary key, then assert it is absent from all log output and error bodies (including provider failures); `/api/render` and `/api/keywords` **never read** `x-llm-key`                                                  |
| **useApiKey hook** (spec + tests written first, hook hand-written) | default memory only; remember on → localStorage; remember off → removed; clear wipes both; reload restores only when remembered                                                                                                                     |
| **API abuse**                                                      | oversize upload (413), wrong type (415), bad magic bytes, compile timeout, rate limit (429)                                                                                                                                                         |
| **Parse fixtures**                                                 | 3 **fictional** sample resumes (PDF + DOCX) → expected redacted text and parsed shape via mock                                                                                                                                                      |
| **E2E**                                                            | sample mode: upload sample → review → preview PDF → tailor → accept → re-render                                                                                                                                                                     |

## Coverage gates

> 80% lines/branches on: keyword engine, `escapeLatex`, truth guard, redaction, compile service. Enforced in CI via Vitest coverage thresholds per directory.

## Environment notes

- **pdflatex is not installed on the dev machine.** Compile tests run inside the dev Docker image (Phase 2) and in CI (TeX Live installed in the job). Locally, compile tests are skipped with a clear message when `pdflatex` is missing; they are never silently passed.
- Windows dev: `.gitattributes` forces LF so fixtures and snapshots match CI.

## Commands

```
npm run lint
npm run typecheck
npm test               # Windows: compile tests skipped with a warning
npm run test:coverage
npm run test:docker    # full suite + coverage gates in the Linux image with pdflatex (also run by CI)
npm run e2e            # Phase 6
```
