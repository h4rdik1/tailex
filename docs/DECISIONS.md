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
- **Confirmed by a real call (2026-11-20, owner's key, fictional resume):** `x-goog-api-key` works on both the models list and generateContent; `gemini-3.5-flash-lite` answers with `finishReason: STOP` and JSON text at `candidates[0].content.parts[0].text`; errors use the standard Google shape `{ error: { code, message, status, details } }`. A full parse used ~583 tokens. The response also contained a `thoughtSignature` (ignored).
- **Corrected after the real call:** a plain `400` was being reported as "key rejected", but it was **our** schema (see ADR-031). Now only 401/403 or reason `API_KEY_INVALID`/`API_KEY_EXPIRED` mean `KEY_INVALID`; any other 4xx is `LLM_REQUEST_REJECTED` (502, "problem on our side"), and the server logs Google's short `status`/`reason` codes (never its message text).
- **Still not confirmed:** free-tier limits for this model and the free-tier data-use rule (the UI note stays cautious: "may use prompts").
- **Tradeoffs:** We maintain ~100 lines of adapter instead of an SDK, but we see every byte that's sent, and the host is a constant (SSRF).

## ADR-028 — A 30-line logger instead of pino

- **Context:** Logs must never contain the key, bodies or file contents.
- **Choice:** `createLogger` writes JSON lines with **only scalar fields we pass explicitly**. There is no API to log a request object, so headers and bodies can't leak by accident. A log-capture test sends a canary key through success, invalid output, a provider error that echoes the key, and a crash.
- **Tradeoffs:** No log levels config, transports or pretty printing. Fine for Cloud Run, which just collects stdout.

## ADR-029 — PDF/DOCX extraction with `unpdf` + `mammoth` (approved by owner)

- **Context:** Reading text from PDFs properly needs a PDF engine. Writing one is out of scope. Rule 3: ask before adding. Owner approved both on 2026-11-20.
- **Choice:** `unpdf@2.2.1` (MIT, 0 runtime deps, UnJS, wraps Mozilla's pdf.js for servers) for PDF, and `mammoth@1.13.0` (BSD-2) for DOCX (raw text mode). Both pinned exactly, both read from memory. Rejected: `pdf-parse` (pulls a native canvas module), raw `pdfjs-dist` (more setup for the same engine).
- **Our own limits around them:** PDF ≤ 10 pages; DOCX goes through `checkZipLimits` first (≤ 10 MB unpacked, ≤ 500 files, no ZIP64, damaged directories rejected), a zip-bomb guard written against the ZIP spec with no extra dependency; 10 s timeout on waiting for extraction.
- **Tradeoffs:** pdf.js is a large engine (more code we trust). Residual risk: a ZIP can _lie_ about its uncompressed size in the directory; the 1 MB upload cap, the time limit and Cloud Run's memory limit bound the damage. `isEvalSupported` (the 2024 pdf.js CVE switch) no longer exists in this pdf.js build because the eval path was removed upstream.
- **Lesson:** a lockfile generated on Windows dropped Linux-only optional packages, so `npm ci` failed in Docker. The lockfile is now refreshed inside the Linux container; CI's Linux `npm ci` guards against a repeat.

## ADR-030 — Redaction heuristics and placeholder restore

- **Choice:** Regexes for emails, URLs (incl. bare `linkedin.com/in/…`, `github.com/…`), `@handles`, and phone-shaped runs with 10–15 digits that aren't all years. Name = the first line if it's 2–4 capitalised words (not "RESUME"). After parsing, placeholders in body text are restored only when unambiguous (one email/phone/name, exactly one link); otherwise `[LINK]` stays visible for the user to fix.
- **Tradeoffs:** Heuristics miss things (a name not on the first line, unusual phone formats). That's why the UI says "best-effort" and shows the exact text sent.
- **Found in the first real call:** a bare personal domain (`asha.example.org`, shown in the PDF without `https://`) reached the LLM. Added a case-sensitive bare-domain rule limited to common site endings (`.com .org .dev .io .in …`), with tests that tech names (`Node.js`, `ASP.NET`, `B.Tech`, `Socket.IO`) are not touched.

## ADR-031 — Send the provider the schema's shape, not its limits

- **Context:** The first real call failed with Gemini's 400 "schema produces a constraint that has too many states for serving". Our Zod-generated JSON Schema carried every `maxLength`/`maxItems`, and nested limits multiply into a huge output-constraint machine.
- **Options:** Loosen the Zod limits · hand-write a second schema · strip limit keywords from the generated one.
- **Choice:** `toProviderJsonSchema` strips `maxLength`, `minLength`, `maxItems`, `minItems`, `pattern` (and `$schema`) from `z.toJSONSchema(...)`. The provider gets the **shape** (fields, types, required, no extra properties); **Zod still enforces every limit** on the answer.
- **Tradeoffs:** The model might produce an over-long field, which Zod then rejects (one retry, then a clear error). That's the right place for the check anyway: provider features are not security.

## ADR-032 — Hand-written shadcn-style components on `radix-ui` (approved by owner)

- **Choice:** One `radix-ui` package (Collapsible, Checkbox, Tabs, Label, Slot) for keyboard/focus/ARIA behaviour, styled with Tailwind in ~8 small files. No shadcn CLI, no `class-variance-authority` (plain variant maps), no toast library (one `aria-live` region per place that changes).
- **Tradeoffs:** A bit more code than the generated components, but every line is ours and explainable. Native elements (`<select>`, `<details>`) are used where they are already accessible.

## ADR-033 — Resume edits as a reducer, ids created outside it

- **Choice:** The review form is fully controlled; every change is a typed action for `resumeReducer` (a pure function, unit-tested without a browser). New ids (`exp-1a2b3c4d`) are made by the caller with `crypto.randomUUID()` and passed in the action, so the reducer stays pure (React StrictMode may run reducers twice).
- **Why not a form library:** The data is one nested object with a shared Zod schema; a reducer plus `ResumeDataSchema.safeParse` gives validation and editing in plain React.
- **Comma lists** (skills, tech) keep a local draft and are split on blur, so typing a comma is never swallowed.

## ADR-034 — PDF preview: blob URL, manual "Update preview", one BUSY retry

- **Choice:** `/api/render` returns the PDF; the browser shows it from a `blob:` URL in an `<iframe>`. The old URL is revoked on every new PDF and on unmount. Rebuilding is a button ("Update preview", with an "Out of date" badge) rather than on every keystroke, which keeps pdflatex load low on a 1–2 instance server. A `503 BUSY` is retried once after 1.5 s; only the newest request may update the screen.
- **Follow-up for Phase 6:** the CSP must allow `frame-src blob:` (and nothing wider) for this iframe.
- **Layout:** side by side at ≥ 1024 px, Edit/Preview tabs below, chosen with `useMediaQuery` (`useSyncExternalStore`) so the form is mounted only once.

## ADR-035 — `useApiKey` authorship

- **Context:** CLAUDE.md rule 6 says the owner hand-writes `useApiKey`.
- **What happened:** The owner wrote the in-memory state, trimming, the remember/clear logic and the storage write/remove helpers against the spec and tests. At the owner's request, the assistant then finished the last step: reading the stored key on load (`readStored` + `parseStored` with `PublicProviderSchema`, lazy `useState`) and `setProvider`.

## ADR-036 — One scaled design, sized automatically to fill one page

- **Context:** Real resumes looked half-empty (A4, fixed gaps) or spilled to page 2, and the only fix was a manual "Tighten spacing" button. A first attempt stretched gaps on short pages (`\flushbottom`); the owner rejected it because bullets drifted apart and the rhythm changed from resume to resume. A second attempt (fixed design, white space at the bottom) was rejected too: both reference resumes fill the page, so empty space is not acceptable.
- **Choice:** One design, built from the owner's reference (Jake's-Resume style, MIT licence; our code is our own), with **every measurement multiplied by a single scale factor**: font sizes, line distances, gaps, strut and margins (`layoutFor(level)` in `template.ts`). There are 14 levels, 2 % apart; level 6 is exactly the reference. Because everything scales together, every size has the same look and rhythm, so nothing "drifts". The server picks the **largest level that still fits on one page**, found by binary search on the real pdflatex page count (a bigger size never fits when a smaller one does not): at most 4 compiles instead of 14.
- **Measured against the reference, not eyeballed:** the original template was compiled with `titlesec`/`enumitem` in a throwaway container with the same fictional content; both files print `\pagetotal` before every section. At level 6 our section heights were within ~2–3pt of the reference (Skills 95.3 vs 95.5, Projects 222.0 vs 220.4, Education 60.1 vs 59.6; Experience differs only because two bullets wrap in the reference). One real bug found this way: a strut taken from the heading font made every heading 5pt too tall, so struts now have an explicit scaled size.
- **Limits:** text stays readable (level 1 body is 8.8pt, level 14 is 12.5pt, margins 0.4–0.6in). When even level 1 needs two pages, the UI asks the user to shorten; when even level 14 leaves the page under 75 % full, the UI suggests adding a project or bullets. We never stretch gaps unevenly to hide a short resume.
- **Template:** US Letter, Skills → Experience → Projects → Education, small-caps headings with one shared underline macro, heading rows with a strut like table rows, a small hanging bullet dot, no negative `\vspace`. Built from base LaTeX + `geometry` only: `titlesec`, `enumitem` and `fullpage` are not in our minimal TeX Live, and `texlive-latex-extra` would cost hundreds of MB per image.
- **Known difference:** we use T1 + Latin Modern (needed for `<`, `>` and accented characters); the reference uses OT1 Computer Modern, whose glyphs are a hair wider, so a bullet that ends exactly at the margin may wrap in one and not the other.
- **API:** `POST /api/render` takes `{ resume }` (an old `spacing` field is ignored) and returns `x-layout` (the level, 1–14) and `x-page-fill` headers.

## ADR-037 — Recover hidden link targets and the location for the contact block

- **Context:** A PDF or Word link shows words ("LinkedIn", "GitHub") but keeps the address in the link itself, so text extraction never saw it and the contact line lost its links. The location (e.g. "Bangalore, Karnataka") was also never extracted. Both had to be typed in the review form.
- **Choice (links):** The extractor now returns `{ text, urls }`. For PDFs it reads pdf.js link annotations (`page.getAnnotations()`, already part of `unpdf`); for Word it reads only the `href` values from `mammoth`'s HTML conversion (the HTML is never rendered or returned). `keepSafeUrls` keeps only `http(s)` and `mailto:`, removes duplicates and caps count (20) and length (500). `redactContact(text, hiddenUrls)` merges them with the links found in the text: same page written two ways counts once (the visible form wins), the existing `SAFE_URL_PATTERN` and 5-link cap still apply, well-known sites get friendly labels (LinkedIn, GitHub, GitLab, LeetCode, X, Twitter) and other sites show their address. A `mailto:` link fills Email only when the text had none.
- **Privacy:** The hidden addresses were never in the text, and they still are not: they only complete the contact block the user reviews. A test checks that no hidden address reaches the LLM request.
- **Choice (location):** `guessLocation` runs on the **redacted** text. In the first four lines (stopping at a section heading) the placeholders and `| · • – —` cut each line into pieces; the first piece that looks like a place (capitalised comma-separated parts, optional postcode, not a link label like "LinkedIn", at most 60 characters) is the location. A piece on a line of its own counts only when it has a comma, so an unrecognised name is not mistaken for a city. A city lower on the page (a job's location) is never reached.
- **Tradeoffs:** Heuristic, like the rest of redaction: when unsure it returns an empty string and the user fills it in. A label with no page behind it (the word "GitHub" with no link) stays text, because we cannot invent an address. Location is not replaced by a placeholder in the text sent to the LLM (it is not in the list of redacted items in CLAUDE.md and the model needs jobs' cities as context).

## Pending

- **Analytics:** Cloudflare Web Analytics vs Umami vs GoatCounter. Owner decides in Phase 6. Counts only: `resume_uploaded`, `pdf_generated`, `sample_used`.
