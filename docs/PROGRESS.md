# PROGRESS — Tailex

Each phase: plan mode → approval → build → lint/typecheck/test output pasted → review → one conventional commit.

## Phase 0 — Docs ✅

- [x] CLAUDE.md + README.md at root; SPEC, ARCHITECTURE, DECISIONS, SECURITY, TESTING, PROGRESS in `docs/`
- [x] .gitignore, .gitattributes, .editorconfig, LICENSE (MIT)
- [x] Stack updated (React + Vite, Node 24) and name chosen (Tailex), both logged as ADRs
- [x] Commit `docs: add phase 0 project docs`

## Phase 1 — Scaffold + tooling + CI ✅

- [x] npm workspaces: `apps/web`, `apps/server`, `packages/shared`
- [x] Strict TS configs, ESLint (incl. no `dangerouslySetInnerHTML`), Prettier
- [x] Vitest wired in each package; `/api/health` + 1 smoke test
- [x] GitHub Actions: lint, typecheck, test, `npm audit`
- [x] `.env.example`

## Phase 2 — LaTeX template + escape + sandboxed compile ✅

- [x] `escapeLatex` spec (`apps/server/src/services/latex/escape-latex.spec.md`) + tests written
- [x] **Owner:** implemented `escapeLatex` (49/49 tests, 100% coverage)
- [x] One-page template, minimal packages (no texlive-latex-extra, ADR-020)
- [x] Compile service: flags, `openin/openout_any=p`, 10 s tree-kill, temp dir, concurrency cap
- [x] Log parser → `{line, message}`; page-count detection
- [x] Dev Dockerfile with pdflatex + `compose.dev.yaml` + `npm run test:docker`
- [x] Sandbox tests verified against a control run (ADR-024)
- [x] Injection + fuzz tests written (they pass once `escapeLatex` exists)
- [x] `POST /api/render`, ResumeData schema, text normalization (ADR-021), docs/LEARNING.md
- [x] Commit `feat: latex template, escape and sandboxed compile`

## Phase 3 — Providers + key + redaction + extraction + parse

Built on branch `phase-3` while the owner was away (not merged to `main`).

- [x] Check Gemini official docs (model, JSON mode, auth), ADR-027, with open questions listed
- [x] `LlmProvider` interface, Gemini (REST, no SDK) + mock, allowlist
- [x] `requireLlmKey` (parse/key-test; tailor in Phase 5), logger, key log-capture test
- [x] PII redaction (emails, phones, links, handles, name guess) + placeholder restore
- [x] Upload: raw body ≤ 1 MB, magic bytes, in memory only (ADR-026)
- [x] **Owner:** approved `unpdf@2.2.1` + `mammoth@1.13.0` for PDF/DOCX text (ADR-029)
- [x] Real extractor + 10-page PDF cap + DOCX zip-bomb guard + tests on a real fictional PDF and DOCX
- [x] `parse-v1` + `tailor-v1` stored verbatim (test compares them with SPEC.md), Zod validate + 1 retry, ids
- [ ] **Owner:** read the final prompt text before the first real Gemini call
- [x] 3 fictional resume fixtures (redaction)
- [x] Real call with the owner's Gemini key (local): end-to-end parse works; fixed schema "too many states" (ADR-031), 400 mapping, and a bare-domain redaction leak (ADR-030)
- [ ] **Owner:** rotate the Gemini key used for testing (it was pasted in chat)

## Phase 4 — UI v1

- [x] **Owner:** `useApiKey` hook (spec + tests first; owner wrote steps 1–2, assistant finished step 3 on request, ADR-035)
- [x] Layout, theme (zinc + emerald, light/dark), stepper
- [x] Key card (collapsible, badge, test, remember, clear)
- [x] Upload + "See what's sent" + review form
- [x] PDF preview (split view / mobile tabs), cold-start state
- [x] Sample mode → **v1**
- [x] Template matched to the reference design (US Letter, Skills first) + one design auto-scaled to fill one page (ADR-036)

## Phase 5 — Tailoring (v1.1)

- [ ] `skills.json` + keyword engine + JD fixtures
- [ ] Missing-skill selection UI
- [ ] `tailor-v1` prompt (show final text first)
- [ ] **Owner:** truth guard (spec + tests first, then wait)
- [ ] Diff UI with Accept/Reject + Blocked state → **v1.1**

## Phase 6 — Hardening + deploy

- [ ] helmet, CSP, rate limits, trust proxy
- [ ] Playwright e2e (sample mode)
- [ ] Production multi-stage Dockerfile, non-root, healthcheck
- [ ] Cloud Run config (max instances 1–2, low concurrency)
- [ ] Analytics (owner chooses)
- [ ] Final README

## Later (out of v1/v1.1 scope)

- [ ] `j/k`, `a/r` diff shortcuts · [ ] undo accepted diffs · [ ] JSON export/import · [ ] `beforeunload` warning
