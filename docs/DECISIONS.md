# DECISIONS — Tailex

Short ADRs. Format: **Context · Options · Choice · Tradeoffs.** New decisions are appended as they are made.

---

## ADR-001 — Frontend: Vite + React SPA (not Nuxt, not Next.js)

- **Context:** The original brief specified Nuxt 3. Nuxt 3 reached end of life on 31 Jul 2026, and Nuxt UI v4 requires Nuxt ≥ 4.1. The owner's target employers mostly use React, and Vue/Nuxt is already covered by their work experience.
- **Options:** Nuxt 4 + Nuxt UI · Vite + React 19 + shadcn/ui · Next.js static export.
- **Choice:** **Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui (Radix)**, built as a static SPA. (React Router was dropped in ADR-017.)
- **Tradeoffs:** More assembly than Nuxt UI (stepper and color mode are built by us). Next.js was rejected because with `ssr: false` and an Express backend its main features (SSR, server actions, edge routes) would go unused and would be hard to justify. shadcn copies component source into the repo, so we own and can explain every component.

## ADR-002 — Runtime: Node 24 LTS

- **Context:** The brief said Node 20, which reached end of life on 30 Apr 2026.
- **Options:** Node 22 (EOL Apr 2027) · Node 24 (EOL Apr 2028).
- **Choice:** **Node 24 LTS**.
- **Tradeoffs:** Newest LTS, so a few packages may lag. Longest support window, and it's already installed locally.

## ADR-003 — One container, same origin

- **Context:** Static frontend + API, deployed to Cloud Run with scale to zero.
- **Options:** Separate static host (CDN) + API · one Express container serving both.
- **Choice:** **One container.** Express serves `/api/*` and the built SPA.
- **Tradeoffs:** No CDN edge caching for assets (fine at portfolio scale). In return: no CORS, a simpler CSP (`'self'`), one deploy, one cold start.

## ADR-004 — Bring your own key (BYOK)

- **Context:** A public demo must not spend the owner's money or store secrets.
- **Options:** Owner's key server-side · BYOK in the browser · no LLM.
- **Choice:** **BYOK.** The key is held in browser memory and sent per request in headers. Optional opt-in localStorage. No cookies.
- **Tradeoffs:** Friction for visitors, offset by **sample mode**. localStorage is readable by XSS, so "remember" is off by default with a warning, and the strict CSP + no raw HTML reduce XSS risk.

## ADR-005 — Redact PII before the LLM

- **Context:** Resumes contain contact details that the LLM doesn't need for parsing.
- **Options:** Send raw text · redact deterministically in code · ask the LLM to redact.
- **Choice:** **Deterministic code redaction** to `[NAME] [EMAIL] [PHONE] [LINK]`, re-inserted at render time after the user confirms.
- **Tradeoffs:** Name detection is a best-effort heuristic, so the UI says "best-effort". Asking the LLM to redact would defeat the purpose, since the text would already have been sent.

## ADR-006 — Own LaTeX template + pdflatex (not HTML → PDF)

- **Context:** Output must be a one-page, ATS-friendly PDF with typographic quality.
- **Options:** Headless Chrome HTML → PDF · pdf-lib layout · LaTeX.
- **Choice:** **One LaTeX template + pdflatex** in a minimal TeX Live.
- **Tradeoffs:** Bigger image and an injection surface. Mitigated by `escapeLatex`, `-no-shell-escape`, `openin_any/openout_any=p`, a timeout, temp-dir isolation and a concurrency cap. Produces clean, selectable, ATS-parsable text. Users never submit raw LaTeX.

## ADR-007 — Shared Zod schemas via npm workspaces

- **Context:** Client and server must agree on `ResumeData` and the API shapes.
- **Options:** Duplicate types · OpenAPI codegen · shared workspace package.
- **Choice:** **`packages/shared`** with Zod schemas and `z.infer` types, using npm workspaces (built in, no extra tool).
- **Tradeoffs:** A small build/tsconfig setup cost. One source of truth, and runtime validation on the server.

## ADR-008 — Stable ids assigned in code, not by the LLM

- **Context:** Tailoring suggestions reference bullets by id.
- **Choice:** After Zod validation, code assigns deterministic ids (`exp{i}-b{j}`, `proj{i}-b{j}`, `skills{i}`).
- **Tradeoffs:** None significant. The LLM can't produce colliding or invented ids, and `tailor` output is checked against known ids.

## ADR-009 — Deterministic keyword engine (not LLM extraction)

- **Context:** Matched/missing skills drive what the user is offered to add.
- **Options:** Ask the LLM · curated dictionary with aliases.
- **Choice:** **Curated `skills.json` + alias matching**, with token-aware handling of `C++`, `.NET`, `Node.js`.
- **Tradeoffs:** It misses skills that aren't in the dictionary. In return it's explainable, testable, free, consistent, and needs no key.

## ADR-010 — Truth guard in code

- **Context:** LLMs can fabricate skills or metrics despite the prompt rules.
- **Choice:** A **code** guard compares each suggestion with the original bullet, the resume and the user-confirmed skills. It blocks new skills, tools, employers and numbers/percentages. Blocked items are shown with the reason.
- **Tradeoffs:** May block some legitimate rephrasings (false positives are preferred over fabrications). Hand-written by the owner.

## ADR-011 — Native PDF preview via `blob:` URL (not pdf.js)

- **Context:** Preview the compiled PDF in the browser.
- **Options:** pdf.js · native `<iframe>`/`<object>` with a blob URL.
- **Choice:** **Native preview** + "Open PDF" fallback for mobile Safari.
- **Tradeoffs:** Rendering varies by browser. No extra dependency or worker. The CSP must allow `blob:` in `frame-src`/`object-src` only.

## ADR-012 — Host: Google Cloud Run

- **Context:** Low-traffic portfolio app needing a container (for TeX Live).
- **Choice:** **Cloud Run**, min instances 0, max 1–2, low concurrency.
- **Tradeoffs:** Cold starts, handled in the UI with a "Waking up server…" state. Max instances also caps cost and the blast radius of abuse.

## ADR-013 — Prompts `parse-v1` and `tailor-v1`

- **Context:** Each feature makes a single structured LLM call.
- **Choice:** Versioned constants in `apps/server/src/prompts/`, stored verbatim from SPEC.md, JSON mode, temperature 0–0.3, no tools, no agent loops.
  - `parse-v1`: **extract, don't improve.** Converts redacted text into the schema, keeps placeholders, and treats `<resume_text>` as data.
  - `tailor-v1`: **rephrase with the JD's terms only where the bullet already supports them.** Never adds facts; returns `{id, suggested, reason}` and treats `<jd>`/`<bullets>` as data.
- **Tradeoffs:** Prompts reduce bad output but are **not** a security control. Zod and the truth guard are. Version strings allow comparing fixture outputs when prompts change.

## ADR-014 — Product name: Tailex

- **Context:** "Tailord" was taken (tailord.app). Checked "Tailex" (Nov 2026): no resume/job product found on the web or GitHub. `tailex.app` and `tailex.com` are registered (one is an unrelated admin platform); `tailex.dev` and `tailex.io` appeared unregistered.
- **Choice:** **Tailex.** The repo folder stays `cvfit`.
- **Tradeoffs:** No matching `.com`/`.app` domain. Use the Cloud Run URL or `tailex.dev` if registered later.

## ADR-015 — TypeScript 6.0 (not 7.0)

- **Context:** TypeScript 7.0.2 (the native Go compiler) is the latest release, but `typescript-eslint` 8.73 supports only `typescript >=4.8.4 <6.1.0`.
- **Options:** TS 7 without type-aware linting · TS 6.0.3 with type-aware linting.
- **Choice:** **TypeScript 6.0.3**, pinned.
- **Tradeoffs:** Slower `tsc` than TS 7. Keeps `strictTypeChecked` lint rules (e.g. no floating promises, no `any` leaks). Revisit when typescript-eslint supports TS 7.

## ADR-016 — Run the server's TypeScript natively on Node 24 (no tsx, no build step)

- **Context:** Node 24 strips TypeScript types natively. The server and `packages/shared` only need to run, not ship as a library.
- **Options:** `tsx`/`ts-node` · compile with `tsc` to `dist/` · Node native type stripping.
- **Choice:** **Node native.** `node src/index.ts` (and `node --watch` in dev). `tsc` only typechecks (`noEmit`). `packages/shared` exports its `.ts` source, consumed by Node, Vite and Vitest alike.
- **Tradeoffs:** Only erasable syntax is allowed (no `enum`, no `namespace`, no parameter properties), enforced by `erasableSyntaxOnly`. Relative imports need `.ts` extensions. One fewer dependency and no build step for the server. Verified working through the npm workspace symlink on Windows.

## ADR-017 — No React Router

- **Context:** The UI is one page with a 5-step stepper. Nothing is stored, so a deep link like `/review` would open empty.
- **Options:** React Router with a route per step · in-memory step state.
- **Choice:** **In-memory step state** (`useReducer`) in Phase 4. No router dependency.
- **Tradeoffs:** No per-step URLs, and the browser back button doesn't move between steps. Can be added later if real routes appear (e.g. an /about page).

## ADR-018 — GitHub Actions pinned to commit SHAs

- **Context:** Tags on third-party actions can be moved to point at different code (supply-chain risk).
- **Choice:** Pin `actions/checkout` and `actions/setup-node` to full commit SHAs, with the version in a comment. CI uses `permissions: contents: read`.
- **Tradeoffs:** Updates are manual (or via Dependabot later).

## ADR-019 — Lint without eslint-plugin-react / eslint-config-prettier

- **Context:** `eslint-plugin-react` 7.37.5 doesn't support ESLint 10. Its main use for us was banning `dangerouslySetInnerHTML`.
- **Choice:** Ban it with a core `no-restricted-syntax` rule (verified that it errors). Skip `eslint-config-prettier`, because no enabled config has formatting rules. Prettier runs separately (`format:check` in CI).
- **Tradeoffs:** No other React-specific lint rules beyond `react-hooks`. Two fewer dependencies.

## ADR-020 — Minimal TeX Live: no `texlive-latex-extra`

- **Context:** The template needs bullets with custom spacing and section headings. The usual packages (`enumitem`, `titlesec`) are only in Debian's `texlive-latex-extra`, a large package. Checked with `kpsewhich` in `node:24-trixie-slim`.
- **Options:** Install `texlive-latex-extra` · write those two pieces with plain LaTeX.
- **Choice:** **Plain LaTeX** (`list` environment and a small `\resumesection` macro). Image packages: `texlive-latex-base`, `texlive-latex-recommended`, `texlive-fonts-recommended`, `lmodern` (TeX ≈ 130 MB).
- **Tradeoffs:** A few more lines in the template. Smaller image, faster cold starts on Cloud Run, smaller attack surface.

## ADR-021 — Normalize text before escaping (unsupported characters are dropped and reported)

- **Context:** pdflatex with T1 fonts can't print emoji, CJK and many symbols. One such character made the whole compile fail with a confusing error. PDF extraction also produces ligatures (`ﬁ`) and odd spaces.
- **Options:** Switch to XeLaTeX/LuaLaTeX with Unicode fonts (much bigger image, slower) · fail the request · clean the text.
- **Choice:** `createTextCleaner` (`normalize-text.ts`): NFC, map ligatures/hyphens/NBSP, remove invisible characters, keep ASCII + Latin-1 + a tested set of typography (`‘ ’ “ ” – — … • € ™`), **drop anything else and report it** in the `x-render-warnings` header so the UI can warn the user.
- **Tradeoffs:** Non-Latin names (e.g. Devanagari) can't be printed in v1. This is an accepted limitation, made visible to the user, never silent. A compile test proves every allowed character compiles.

## ADR-022 — Concurrency cap without a queue

- **Context:** pdflatex is CPU-heavy; Cloud Run gives us 1–2 small instances.
- **Options:** No cap · cap + waiting queue · cap + immediate `503 BUSY` with `Retry-After`.
- **Choice:** **Cap 2, no queue** (`slot-limiter.ts`).
- **Tradeoffs:** Under a burst some users see "busy, retry in 5 s" (the UI will retry once automatically in Phase 4). A queue would hold connections open and use memory, which is an abuse vector with no benefit at our traffic.

## ADR-023 — Compile tests run in Docker (and are never silently skipped there)

- **Context:** The owner's laptop is Windows without pdflatex. CI is Linux.
- **Choice:** `compose.dev.yaml` + `Dockerfile.dev` provide pdflatex. `npm run test:docker` runs the whole suite in that image, and CI's `compile` job runs the same command. Compile tests use `describe.skipIf(!hasPdflatex)`, but with `REQUIRE_PDFLATEX=1` (set in the image) a missing pdflatex **throws** instead of skipping. Coverage gates are enforced only in that mode.
- **Tradeoffs:** `npm test` on Windows covers less, and says so in a warning. In return, identical results locally and in CI.

## ADR-024 — Sandbox flags verified against a control run

- **Context:** "The compile failed" is not proof that the sandbox blocked an attack: without `openin_any=p`, `\input{/etc/passwd}` DOES read the file and then fails on its contents.
- **Choice:** Sandbox tests assert the specific refusal (`File '/etc/passwd.tex' not found`, `\openin` stream stays closed, `runsystem(...)...disabled`, `I can't write on file`). These were compared manually against a run without the flags (see docs/LEARNING.md, Phase 2).
- **Tradeoffs:** Tests depend on exact pdflatex messages, so a TeX Live upgrade may need test updates. That's acceptable for a security property.

## ADR-025 — Link URLs: strict allowlist + `escapeHrefUrl`

- **Context:** A URL inside `\href{...}` follows different rules from normal text: `%` must become `\%` but `~` and `_` must stay as-is.
- **Choice:** Zod `SAFE_URL_PATTERN` (http/https only, no `\ { } $ ^ | " space`). Inside `\href`, `escapeHrefUrl` escapes only `% # &`. The visible link text goes through `escapeLatex` like all other text.
- **Tradeoffs:** Some exotic but valid URLs are rejected. Tested: the PDF's link target equals the original URL.

## ADR-026 — Upload as a raw request body (no multipart library)

- **Context:** `/api/parse` receives exactly one file of at most 1 MB.
- **Options:** `multer`/`busboy` with `multipart/form-data` · send the file as the raw body.
- **Choice:** **Raw body** via Express's built-in `express.raw({ limit: 1 MB })`. The browser will `fetch(url, { body: file })`. The Content-Type header is ignored for security decisions; **magic bytes** decide the type (`file-type.ts`).
- **Tradeoffs:** No file name or extra form fields in the same request (we don't need them). One fewer dependency, and the body never touches disk.

## ADR-027 — Gemini over plain REST, model `gemini-3.5-flash-lite`

- **Context:** Rule 7: check the official docs, not memory. Read on 2026-11-20 at aistudio.google.com/docs (ai.google.dev now redirects there).
- **Choice:** `fetch` against `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent` with `systemInstruction`, `generationConfig.responseMimeType = "application/json"` and `responseJsonSchema` (generated from the same Zod schema with `z.toJSONSchema`). The key goes in the **`x-goog-api-key` header**, never the URL. Key check: `GET /v1beta/models?pageSize=1` (no tokens). No SDK.
- **Why this model:** labelled Stable, described as the fastest and most cost-effective 3.5 model, and named by Google for new projects. `gemini-2.5-flash` is being auto-routed to it from 2026-12-01.
- **Not confirmed in the docs (verify with a real key before launch):** free-tier availability and limits for this model; the exact status code for an invalid key (we map 400/401/403 to `KEY_INVALID`, so a malformed request of ours would also show as "key rejected"); the error JSON shape; whether `x-goog-api-key` is accepted on the models-list endpoint; the free-tier data-use rule (the UI note stays cautious: "may use prompts").
- **Tradeoffs:** We maintain ~100 lines of adapter instead of an SDK, but we see every byte that's sent, and the host is a constant (SSRF).

## ADR-028 — A 30-line logger instead of pino

- **Context:** Logs must never contain the key, bodies or file contents.
- **Choice:** `createLogger` writes JSON lines with **only scalar fields we pass explicitly**. There is no API to log a request object, so headers and bodies can't leak by accident. A log-capture test sends a canary key through success, invalid output, a provider error that echoes the key, and a crash.
- **Tradeoffs:** No log levels config, transports or pretty printing. Fine for Cloud Run, which just collects stdout.

## ADR-029 — PDF/DOCX extraction: dependency proposal (waiting for owner approval)

- **Context:** Reading text from PDFs properly needs a PDF engine. Writing one is out of scope. Rule 3: ask before adding.
- **Proposal:** `unpdf@2.2.1` (MIT, 0 runtime deps, UnJS, wraps Mozilla's pdf.js for servers, updated 2026-11-15) for PDF, and `mammoth@1.13.0` (BSD-2, updated 2026-09-26) for DOCX (raw text mode). Rejected: `pdf-parse` (pulls a native canvas module), raw `pdfjs-dist` (more setup for the same engine).
- **Until approved:** `TextExtractor` is an interface; the default answers `501 EXTRACTION_UNAVAILABLE`; tests inject a fake. Zip-bomb protection for DOCX (uncompressed-size cap) gets built with mammoth.

## ADR-030 — Redaction heuristics and placeholder restore

- **Choice:** Regexes for emails, URLs (incl. bare `linkedin.com/in/…`, `github.com/…`), `@handles`, and phone-shaped runs with 10–15 digits that aren't all years. Name = the first line if it's 2–4 capitalised words (not "RESUME"). After parsing, placeholders in body text are restored only when unambiguous (one email/phone/name, exactly one link); otherwise `[LINK]` stays visible for the user to fix.
- **Tradeoffs:** Heuristics miss things (a name not on the first line, unusual phone formats). That's why the UI says "best-effort" and shows the exact text sent.

## Pending

- **Analytics:** Cloudflare Web Analytics vs Umami vs GoatCounter. Owner decides in Phase 6. Counts only: `resume_uploaded`, `pdf_generated`, `sample_used`.
