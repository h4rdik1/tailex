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

## Pending

- **Analytics:** Cloudflare Web Analytics vs Umami vs GoatCounter. Owner decides in Phase 6. Counts only: `resume_uploaded`, `pdf_generated`, `sample_used`.
