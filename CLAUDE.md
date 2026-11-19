# CLAUDE.md — Tailex

Rules for any AI agent working in this repo. Read fully before acting.

## Product
**Tailex** (repo folder `cvfit`): upload a resume (PDF/DOCX) → extract text → redact PII → LLM parses it into structured JSON → user reviews and edits → render through our own one-page ATS-friendly LaTeX template → PDF. v1.1: paste a JD → see the missing skills → user ticks the ones they really have → LLM suggests bullet rewrites → truth guard → accept/reject diff → re-render.
We **never** add skills the user didn't confirm. Users **never** submit raw LaTeX. No accounts, no database, nothing stored or logged.

## Role and quality bar
- Senior engineer pair-programming. The owner must be able to explain every line in an interview: **clarity over cleverness**.
- Strict TypeScript, no `any`, small functions, meaningful names, no dead code, every error handled.
- Modular: one folder per feature (frontend) and per service (backend). Shared Zod schemas live in `packages/shared`.
- Accessible (keyboard, focus, aria-live), mobile-responsive, light/dark mode.

## Stack (do not change without asking)
- **Frontend:** Vite + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui (Radix) + React Router. Static SPA.
- **Backend:** Node 24 LTS + Express + TypeScript. It serves the API **and** the built SPA from one container (same origin, no CORS).
- **Shared:** Zod schemas in `packages/shared` (npm workspaces).
- **PDF:** pdflatex (minimal TeX Live) in Docker.
- **Tests:** Vitest + supertest. Playwright for 1 e2e (sample mode, LLM mocked).
- **Tooling:** ESLint + Prettier, GitHub Actions CI, `npm audit` in CI.
- **Host:** Google Cloud Run (scale to zero, max instances 1–2, low concurrency).
- **Theme:** zinc neutral base, emerald accent, monospace accents.

## Non-goals
Auth, database, payments, multiple templates, cover letters, saved resumes, server-side key storage, any LLM call using the owner's own key, agent loops or tool use.

## Workflow rules
1. Work one phase at a time (see PROGRESS.md). **Plan mode first**, then wait for approval of the plan.
2. After each phase: run lint, typecheck and tests, **paste the real output**, summarize the changes, list uncertainties, STOP for review. One conventional commit per phase.
3. **Dependencies:** ask before adding any. State why, confirm it exists and is maintained, **pin exact versions**. Prefer the standard library.
4. Never edit a test just to make it pass without saying why. Never say something works unless it was run.
5. Log every non-trivial decision in DECISIONS.md ("why X over Y").
6. **The owner hand-writes** `escapeLatex`, `truthGuard` and the `useApiKey` hook. When you reach one, write its spec + tests first, then STOP and wait.
7. Before using any LLM provider API, check its **current official docs** (model names, JSON/structured output, auth). Don't rely on memory.
8. Ask before choosing analytics (Cloudflare Web Analytics / Umami / GoatCounter). Counts only, no content.

## Security musts (details in SECURITY.md)
- BYOK: the key lives in browser memory. Optional "Remember on this device" (off by default) saves it to localStorage. "Clear key" removes it from both. **No cookies.**
- One helper (`apps/web/src/lib/api-client.ts`) adds `x-llm-key` + `x-llm-provider` headers. Never put the key in a URL, query or body.
- Only `/api/parse`, `/api/tailor` and `/api/key/test` read `x-llm-key`.
- Server: the key is used for one call, then discarded. It is never logged, stored, or put in error messages, analytics or stack traces. The logger redacts `x-llm-key` and never logs bodies or file contents.
- Provider allowlist: the client sends a provider **name** only, and the server maps it to a hardcoded host. Reject unknown providers and any client-supplied URL.
- PII (name guess, email, phone, links) is redacted to `[NAME] [EMAIL] [PHONE] [LINK]` in code **before** any LLM call.
- No `dangerouslySetInnerHTML`, anywhere. LLM output is rendered as plain text.
- Uploads: PDF/DOCX only, ≤ 1 MB, magic bytes checked, processed in memory only, never written to disk.
- LaTeX: escape every user string, `-no-shell-escape`, `openin_any=p`, `openout_any=p`, 10 s timeout that kills the process tree, unique temp dir always deleted, capped concurrency.
- All LLM output is validated with Zod. Retry once, then show a clear error. **Prompts are not security; code validation is.**
- Rate limit per IP on all endpoints (`trust proxy` for Cloud Run). helmet + strict CSP (allows `blob:` for the PDF preview only).
- Secrets: `.env.example` only.

## Data and privacy in the repo
- **The repo is public.** The sample resume and **all test fixtures use fictional people only**: never the owner's real name, phone, email, links or resume content.

## Prompts
Runtime prompts live only in `apps/server/src/prompts/parse.ts` (`parse-v1`) and `tailor.ts` (`tailor-v1`) as versioned constants, stored verbatim from SPEC.md. Never in the browser. Single call, JSON mode, temperature 0–0.3. Show the final prompt text before first use.
