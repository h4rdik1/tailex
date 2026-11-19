# PROGRESS — Tailex

Each phase: plan mode → approval → build → lint/typecheck/test output pasted → review → one conventional commit.

## Phase 0 — Docs ✅
- [x] CLAUDE.md + README.md at root; SPEC, ARCHITECTURE, DECISIONS, SECURITY, TESTING, PROGRESS in `docs/`
- [x] .gitignore, .gitattributes, .editorconfig, LICENSE (MIT)
- [x] Stack updated (React + Vite, Node 24) and name chosen (Tailex), both logged as ADRs
- [x] Commit `docs: add phase 0 project docs`

## Phase 1 — Scaffold + tooling + CI
- [ ] npm workspaces: `apps/web`, `apps/server`, `packages/shared`
- [ ] Strict TS configs, ESLint (incl. no `dangerouslySetInnerHTML`), Prettier
- [ ] Vitest wired in each package; `/api/health` + 1 smoke test
- [ ] GitHub Actions: lint, typecheck, test, `npm audit`
- [ ] `.env.example`

## Phase 2 — LaTeX template + escape + sandboxed compile
- [ ] **Owner:** `escapeLatex` (spec + tests first, then wait)
- [ ] One-page template, minimal packages
- [ ] Compile service: flags, `openin/openout_any=p`, 10 s tree-kill, temp dir, concurrency cap
- [ ] Log parser → `{line, message}`; page-count detection
- [ ] Minimal **dev Dockerfile** with pdflatex (Docker Desktop + WSL2 installed by owner first)
- [ ] Injection + fuzz tests

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
