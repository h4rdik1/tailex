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

- [ ] Check Gemini official docs (model, JSON mode, auth)
- [ ] `LlmProvider` interface, Gemini + mock, allowlist
- [ ] `requireLlmKey` (parse/tailor/key-test only), redacting logger, key log-capture test
- [ ] PII redaction, PDF/DOCX extraction (memory only, magic bytes)
- [ ] `parse-v1` prompt (show final text first), Zod validate + retry, id assignment
- [ ] 3 fictional parse fixtures

## Phase 4 — UI v1

- [ ] **Owner:** `useApiKey` hook (spec + tests first, then wait)
- [ ] Layout, theme (zinc + emerald, light/dark), stepper
- [ ] Key card (collapsible, badge, test, remember, clear)
- [ ] Upload + "See what's sent" + review form
- [ ] PDF preview (split view / mobile tabs), cold-start state
- [ ] Sample mode → **v1**

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
