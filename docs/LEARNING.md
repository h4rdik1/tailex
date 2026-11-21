# LEARNING — how Tailex works, phase by phase

A plain-language build journal. Read it top to bottom once, then use it as a reference before
interviews. Each phase adds a section. Decisions with tradeoffs live in [DECISIONS.md](DECISIONS.md);
this file explains **how things work**.

---

## The big picture (one paragraph)

The browser (a React app) sends a resume file to our server (Express on Node). The server pulls out
the text, hides contact details, asks an LLM to turn the text into structured JSON, and checks that
JSON with Zod. The user edits it. Then the server turns the JSON into a LaTeX file and runs `pdflatex`
in a locked-down sandbox to make the PDF. Nothing is saved anywhere.

---

## Phase 0 — Docs first

- We wrote the rules (CLAUDE.md), the spec, the architecture, the threat model and the test plan
  **before any code**. Interview line: "I designed the security model before writing a line, so every
  later decision had something to be checked against."
- Two version facts drove the stack: Nuxt 3 and Node 20 were already end-of-life in 2026, so we chose
  React + Vite and Node 24 (ADR-001, ADR-002).

## Phase 1 — The skeleton

| Piece              | File(s)                       | What to know                                                                                                                                                                                                                                                      |
| ------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm workspaces     | root `package.json`           | One repo, three packages: `apps/web`, `apps/server`, `packages/shared`. `npm install` at the root links them, so the server can `import … from '@tailex/shared'`.                                                                                                 |
| Shared schemas     | `packages/shared/src/*`       | Zod schemas are the single source of truth: Zod checks data at runtime, and `z.infer` gives the TypeScript type for free.                                                                                                                                         |
| TS without a build | `tsconfig.base.json`, ADR-016 | Node 24 can run `.ts` files directly by **stripping the types**. That's why imports end in `.ts` and why `enum` is not allowed (`erasableSyntaxOnly`): an enum creates real code, so it can't simply be erased. `tsc` is only used to **check** types (`noEmit`). |
| Express app        | `apps/server/src/app.ts`      | `createApp()` builds the app; `index.ts` calls `listen()`. Splitting them lets tests use supertest **without opening a port**.                                                                                                                                    |
| Error handler      | `middleware/error-handler.ts` | Always sends `{ error: { code, message } }` with a **fixed** message. Never `err.message` or the stack: those could contain user data or a key. Express spots error handlers by their **4 parameters**, which is why `_next` stays even though it's unused.       |
| Lint rule          | `eslint.config.js`            | `dangerouslySetInnerHTML` is banned with a core ESLint rule (XSS protection).                                                                                                                                                                                     |
| CI                 | `.github/workflows/ci.yml`    | Every push runs lint → format → typecheck → test → build → `npm audit`. Actions are pinned to commit SHAs because a tag can be moved to different code.                                                                                                           |

---

## Phase 2 — The PDF engine (and Docker)

### Docker in 5 minutes

**Why we need it:** `pdflatex` (the program that turns `.tex` into `.pdf`) isn't on Windows by
default, and it **must** behave exactly the same on your laptop, in CI and on Cloud Run. Docker gives
us one Linux environment we can run anywhere.

**Image vs container.** An **image** is a read-only template: an operating system snapshot plus our
tools, like a class. A **container** is a running instance of an image, like an object. You build
the image once (`docker compose build`) and start throwaway containers from it (`docker compose run --rm`).

**Layers.** Each line in a Dockerfile creates a layer, and Docker caches layers. If a line hasn't
changed, Docker reuses its cached layer, so rebuilds are fast. That's why the slow `apt-get install`
line sits near the top and rarely changes.

**Our `Dockerfile.dev`, line by line:**

```dockerfile
FROM node:24-trixie-slim
```

Start from the official Node 24 image on Debian "trixie", "slim" variant (no extra tools).

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends texlive-latex-base ... \
 && rm -rf /var/lib/apt/lists/*
```

Install only the TeX Live packages the template needs. `--no-install-recommends` skips optional extras.
Deleting the apt lists in the **same** `RUN` keeps the layer small (deleting it in a later line
wouldn't shrink the earlier layer). We checked with `kpsewhich` that `enumitem`/`titlesec` would need
the big `texlive-latex-extra`, so the template uses plain LaTeX instead (ADR-020).

```dockerfile
WORKDIR /app
RUN mkdir -p /app/node_modules /app/apps/web/node_modules && chown -R node:node /app
USER node
```

Work in `/app`. Create the `node_modules` folders and give them to the built-in non-root `node` user,
then switch to that user. **Never run as root**: if something escaped pdflatex, it would have very
few rights.

```dockerfile
ENV REQUIRE_PDFLATEX=1
```

Tells our tests "pdflatex must exist here", so compile tests can never be silently skipped in Docker.

**`compose.dev.yaml`** describes how to run the container, so you don't type long `docker run` commands:

- `volumes: - .:/app` is a **bind mount**: your Windows project folder appears inside the container
  at `/app`. Edit a file in VS Code and the container sees it immediately; no rebuild needed.
- `- node_modules:/app/node_modules` is a **named volume** that sits on top of the bind mount at that
  path. Why: the `node_modules` installed on Windows contains Windows-only binaries (esbuild, rollup).
  Linux needs its own. The named volume keeps a separate Linux `node_modules`, and it persists
  between runs, so `npm ci` stays fast.
- `ports: - '8080:8080'`: your browser's `localhost:8080` reaches the server inside the container.

**The two commands you'll use:**

```bash
npm run test:docker   # npm ci + full test suite with coverage, inside Linux with pdflatex
npm run dev:docker    # the API server with real pdflatex on http://localhost:8080
```

**Handy Docker commands:**

```bash
docker compose -f compose.dev.yaml build          # (re)build the image after editing Dockerfile.dev
docker compose -f compose.dev.yaml run --rm dev sh   # open a shell inside a fresh container
docker image ls tailex-dev                         # image size (~764 MB: Node itself + TeX)
docker volume ls                                   # see the node_modules volumes
docker compose -f compose.dev.yaml down -v         # delete the volumes (forces a clean npm ci)
```

### How a render request flows through the code

```
POST /api/render  (JSON: { resume, spacing })
  │
  ├─ routes/render.ts         Zod-validate the body (RenderRequestSchema, packages/shared)
  │                           → 400 with field paths if invalid
  ├─ slot-limiter.ts          take 1 of 2 compile slots, or answer 503 BUSY + Retry-After
  ├─ template.ts              ResumeData → .tex string, built by small functions.
  │     └─ safe(text) = escapeLatex(cleaner.clean(text))   ← the ONLY way user text enters .tex
  │          ├─ normalize-text.ts   drop/replace characters the fonts can't print (reported)
  │          └─ escape-latex.ts     turn \ { } & % $ # _ ~ ^ into harmless text (owner-written)
  │     └─ escape-href-url.ts      for link targets inside \href{...} only
  ├─ compile.ts               temp folder → pdflatex (sandboxed) → read PDF → delete folder
  │     └─ log-parser.ts      "! message" + "l.<n>" → {line, message}; page count
  └─ response                 application/pdf + x-page-count + x-render-warnings
                              (or 422 COMPILE_FAILED / COMPILE_TIMEOUT, never the raw log)
```

### The sandbox, and how we know it works

`compile.ts` runs `pdflatex -no-shell-escape -interaction=nonstopmode -halt-on-error` with a
**minimal environment**:

| Setting                                            | What it stops                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `-no-shell-escape` + `shell_escape=f`              | `\write18{...}` running shell commands                                     |
| `openin_any=p`                                     | reading absolute paths, `..` paths or hidden files (`\input{/etc/passwd}`) |
| `openout_any=p`                                    | writing files outside the work folder                                      |
| own temp folder (`mkdtemp`), deleted in `finally`  | leftovers and cross-request leaks                                          |
| `detached: true` + `process.kill(-pid)` after 10 s | endless loops like `\def\x{\x}\x` (kills the whole process group)          |
| `env` with only PATH/HOME/...                      | our server's environment variables leaking into TeX                        |

**Lesson learned (good interview story):** the first version of the sandbox tests only checked that
"the file contents don't appear". A manual control run **without** the flags showed that pdflatex
does read `/etc/passwd`, then crashes on its contents, so that test would have passed **even with
no sandbox**. The tests now assert the sandbox's specific refusal message (ADR-024):

| Attack                | With sandbox                       | Without (control)     |
| --------------------- | ---------------------------------- | --------------------- |
| `\input{/etc/passwd}` | `File '/etc/passwd.tex' not found` | file read, then crash |
| `\openin` /etc/passwd | stream CLOSED                      | OPENED                |
| `\write18{touch …}`   | `runsystem(...)...disabled`        | —                     |
| `\openout` /tmp/…     | `I can't write on file`            | —                     |

### Why escaping is the main defense and the sandbox is the backup

The sandbox limits **damage**; escaping prevents **any** LaTeX command from user text in the first
place. Both exist because each could have a bug: that's "defense in depth".

### `escapeLatex`: the piece you wrote

```ts
const REPLACEMENTS = new Map([
  ['&', '\\&'],
  ['\\', '\\textbackslash{}'] /* ...10 rows */,
]);

function escapeChar(char: string): string {
  const code = char.charCodeAt(0);
  if (char === '\n' || char === '\r' || char === '\t') return ' '; // keep words apart
  if (code <= 31 || code === 127) return ''; // invisible junk
  return REPLACEMENTS.get(char) ?? char; // special → safe, else as-is
}

export function escapeLatex(input: string): string {
  return Array.from(input, escapeChar).join('');
}
```

How to explain it in 30 seconds:

1. **A lookup table** maps each of LaTeX's 10 special characters to text that _prints_ that character.
2. **One pass, one character at a time.** Each input character is looked at exactly once, so the `{}`
   we add for `\textbackslash{}` is never escaped again. A chain of `.replace()` calls would break
   that, because each later replace would see what the earlier ones added.
3. **Order of the `if`s matters.** Newline is code 10, which is also `<= 31`. Checking whitespace
   first turns it into a space instead of deleting it (deleting would glue words together).
4. **`Array.from(input)`** splits by real characters (code points), so an emoji isn't cut in half.
5. **Proof:** 49 unit tests (each character, injections, 2,000 fuzzed strings) plus real PDFs where
   `\input{/etc/passwd}` appears as visible text. Coverage 100%.

### Two more testing lessons from finishing Phase 2

- **Shared folders make flaky tests.** A cleanup test checked "no work folders left in /tmp", but
  another test file was compiling PDFs at the same moment. Fix: `compileTex` accepts a `tempRoot`,
  and the test gives itself a private folder. (Test files run in parallel in Vitest.)
- **Test the behaviour, not the formatting.** The link test expected `/URI (https://…)` with a space;
  pdflatex writes `/URI(https://…)`. Both are valid PDF. The test now checks that the exact URL is in
  the PDF, which is the property we actually care about.
- **Check your tools before blaming the code.** A manual smoke test showed a missing backslash. The
  cause was shell quoting in the test script, not the app. A script file (no quoting) proved the
  PDF prints `\input{/etc/passwd}` correctly.

### Testing tricks used here

- **Dependency injection:** `createApp({ compileTex })` lets route tests pass a fake compiler, so
  those tests run on Windows without pdflatex.
- **Seeded fuzzing without a library:** a tiny PRNG (mulberry32) with a fixed seed generates 2,000
  random strings. Same seed means the same strings every run, so a failure is reproducible.
- **Reading PDF text without a library:** `test/helpers/pdf-text.ts` inflates the PDF's zlib
  streams with Node's `zlib` and reads the `(text) Tj` strings. Spaces are positioning in PDFs, so
  words run together; tests compare against text with spaces removed.

### Interview Q&A (Phase 2)

- **Why not let users upload LaTeX?** Arbitrary TeX is a programming language with file access.
  We accept only data (JSON) and generate every command ourselves.
- **Why `{}` after `\textbackslash`?** It ends the command name, so `\textbackslash{}input` isn't read
  as the unknown command `\textbackslashinput`.
- **Why a semaphore without a queue?** CPU protection with the simplest honest behaviour: "busy, retry
  in 5 s". A queue would hold connections open, which is an easy abuse vector.
- **Why a minimal TeX Live?** Smaller image means a faster Cloud Run cold start and fewer things to
  attack. We proved each package with `kpsewhich`.
- **What happens with an emoji in a bullet?** It's dropped before compiling, and the response
  header lists it so the UI can warn. Without this, one emoji would fail the whole PDF.

---

## Phase 3 — The key, the LLM and parsing (branch `phase-3`)

### How an upload flows through the code

```
POST /api/parse   headers: x-llm-provider, x-llm-key   body: the raw PDF/DOCX bytes
  │
  ├─ middleware/require-llm-key.ts   provider name → allowlist (registry.ts) → 400 if unknown
  │                                  key present + looks like a key → else 401
  │                                  stores {provider, key} in a WeakMap tied to THIS request
  ├─ express.raw (≤ 1 MB)            413 FILE_TOO_LARGE if bigger; kept in memory
  ├─ extract/file-type.ts            magic bytes: %PDF- or ZIP+word/document.xml → else 415
  ├─ extract/zip-limits.ts           DOCX only: read the ZIP's table of contents, refuse bombs
  ├─ extract/extractor.ts            bytes → text: unpdf (PDF, ≤ 10 pages) or mammoth (DOCX)
  ├─ redact/redact-contact.ts        email/phone/links/handles/name → [EMAIL] [PHONE] [LINK] [NAME]
  ├─ prompts/parse.ts                system prompt parse-v1 + "<resume_text>…</resume_text>"
  ├─ llm/gemini.ts                   ONE call, JSON mode, temperature 0, key in a header
  ├─ shared LlmParsedResumeSchema    Zod validates; invalid → retry once → 502
  └─ parse/assemble-resume.ts        add ids (exp0-b1…), attach contact, restore placeholders
```

### Ideas worth being able to explain

- **BYOK without storing anything.** The key arrives in a header, lives in a `WeakMap` keyed by
  the request object, is used for one `fetch`, and disappears when the request is garbage-collected.
- **Allowlist vs blocklist (SSRF).** We never ask "is this URL bad?"; we only accept the exact
  names we know (`gemini`, and `mock` outside production). The URL is a constant in our code.
- **Errors that can't leak.** Providers throw only `LlmError`, whose message is a sentence we
  wrote. Gemini's own error text (which might echo the key) is never read into our errors.
- **Why the logger has no "log the request" function.** If it's impossible to call, it's
  impossible to leak. The log-capture test sends a fake "canary" key through 4 scenarios and
  searches every log line and response for it.
- **Retry policy.** Network errors and 5xx: retry once (temporary). 4xx: never (a bad key won't
  fix itself). Invalid JSON from the model: one more LLM call, then a clear error.
- **One schema, two uses.** `z.toJSONSchema(LlmParsedResumeSchema)` tells Gemini the shape we
  want; `LlmParsedResumeSchema.safeParse` checks what came back. They can't drift apart.
- **`.strict()`** makes Zod reject extra keys, so the model can't add fields like `"salary"`.
- **Tag breakout.** The resume text could contain `</resume_text>` to "end" the data block and
  pose as instructions. We strip those tags from the text before wrapping it.
- **Redaction is best-effort.** Regexes catch common formats; the UI shows exactly what was sent.

### The first real Gemini call: three lessons

Every test passed with the mock provider, and the first real call still found three things:

1. **Tests with fakes can only check what you already expect.** Gemini rejected our JSON Schema
   ("too many states"): the length limits we copied from Zod were too much for its output engine.
   Fix: send Google the _shape_ only; Zod keeps checking the limits (ADR-031).
2. **Wrong error labels hide the real problem.** We showed "key rejected" for a schema bug because
   every 400 was mapped to `KEY_INVALID`. Now the server logs Google's short codes
   (`INVALID_ARGUMENT`, `API_KEY_INVALID`) and only a real key problem says "key".
3. **Look at what was actually sent.** The `redactedPreview` showed `asha.example.org` reaching
   the LLM: a bare domain our regexes didn't cover. That's exactly why the UI will show users this
   preview. Fixed with a regression test built from that exact line.

How we debugged it without ever logging the key: we saved the exact request body to a temp file
and the owner sent it to Google with `curl`, so Google's full error message was visible only to them.

### Zip bombs, in plain words

A DOCX is really a ZIP file. ZIP compresses repeated data extremely well, so a 20 KB file can
unpack into 10 GB of zeros and exhaust the server's memory: a **zip bomb**. Before mammoth unpacks
anything, `zip-limits.ts` reads the ZIP's table of contents (the "central directory" at the end of
the file), adds up the sizes each file _says_ it will unpack to, and refuses anything over 10 MB.
The test builds a real bomb in memory: 10 MB of zeros compresses to well under the 1 MB upload
limit, passes the upload check, and is stopped by the zip check.

### A lockfile lesson

`npm install` on Windows wrote a `package-lock.json` that was missing a few Linux-only optional
packages, so `npm ci` failed inside Docker. Running `npm install --package-lock-only` inside the
Linux container fixed it. Takeaway: **run `npm ci` in the same OS as production** (Docker and CI
both do) before trusting a lockfile.

### Interview Q&A (Phase 3)

- **Why not use the Gemini SDK?** One endpoint, ~100 lines; plain `fetch` shows exactly what is sent
  and keeps the host constant. Fewer dependencies to audit.
- **What if the LLM ignores the prompt and invents a job?** Parsing only restructures text we
  already have; the user reviews every field. Inventing in _tailoring_ is caught by the truth guard.
- **How do you test without spending money?** A mock provider plus a fake `fetch` that replays
  scripted Gemini responses (200, 403, 429, 503, network error, blocked prompt).

---

## Phase 4 — The React app (v1)

### How the page is put together

`App.tsx` is the only place that holds the app's data. Everything else gets it through props:

| State                | Lives in                    | What it is                                  |
| -------------------- | --------------------------- | ------------------------------------------- |
| the API key          | `useApiKey()` (called once) | key, provider, remember                     |
| which step you're on | `useReducer(stepsReducer)`  | current step + furthest step reached        |
| the resume           | `useReducer(resumeReducer)` | the full `ResumeData` being edited          |
| the PDF              | `usePdfRender(api.render)`  | idle / rendering / ready (blob URL) / error |

The flow: **Upload** (or "Try with a sample resume") → `api.parse(file)` → `replace` the resume →
**Review** (edit the form) → **Preview** (build the PDF) → **Export** (download).

### `useApiKey`, in plain words

Two directions:

1. **Memory → storage (when you change something).** One rule, `syncStorage`: "if remember is on
   and there is a key, save `{provider, key}`; otherwise delete the saved copy".
2. **Storage → memory (once, when the page loads).** `readStored()` reads the saved text,
   `parseStored()` checks it (real JSON? an object? a provider we allow? a non-empty key?) and deletes
   it if it's broken. `useState(readStored)` (the function, not `readStored()`) runs it only on the
   first render.

Every storage call is inside `try/catch`, because private browsing can make `localStorage` throw.

**The React gotcha you met:** after `setKeyState(trimmed)`, the variable `key` still holds the
**old** value until React renders again. That's why the setters pass the new value straight to
`syncStorage(trimmed, remember)` instead of reading `key`.

### Reducers: edits as data

`resumeReducer(state, action)` takes the current resume and an action like
`{ type: 'setBullet', section: 'experience', entryId: 'exp0', id: 'exp0-b1', text: '…' }` and
returns a **new** resume. It never changes the old one. That gives three things:

- tests without a browser (`resume-reducer.test.ts`);
- "Out of date" for free: a new object after every edit means `pdf.source !== resume`;
- React re-renders only what changed, because untouched parts are the same objects.

### The PDF preview

The server sends PDF bytes. `URL.createObjectURL(blob)` turns them into a temporary `blob:` address
the `<iframe>` can show. Each new PDF **revokes** the previous address so old PDFs don't pile up in
memory. If the server says `503 BUSY` (both pdflatex slots in use), the hook waits 1.5 s and tries
**once** more. If you click twice quickly, only the newest answer is shown.

### Accessibility checklist we followed

- Every input has a `<Label htmlFor>` (via `useId`), and every icon button has an `aria-label`
  ("Move Job 1 bullet 2 up").
- When the step changes, focus moves to the new step's heading (`tabIndex={-1}`).
- Status changes are announced with `aria-live` / `role="status"`; errors with `role="alert"`.
- Real `<button>`s, native `<select>` and `<details>`: keyboard support with no extra code.
- A "Skip to content" link, visible focus rings, and `prefers-reduced-motion` respected.

### Interview Q&A (Phase 4)

- **Why is the key in React state and not a cookie?** Cookies are sent with every request
  automatically; we want the key only in one header, on three endpoints, and only when we choose.
- **Why does `App` call `useApiKey` once?** Each call has its own state. Two calls would mean two
  keys that can disagree; one call and props give one source of truth.
- **Why validate localStorage?** It's input we don't control (old versions, DevTools edits).
  Treat it like an API response: parse safely, check with Zod, delete if broken.
- **Why not re-render the PDF on every keystroke?** pdflatex takes about a second and the server
  allows two at a time; a button plus an "Out of date" badge is cheaper and still clear.
- **How do you stop an old slow request from overwriting a newer one?** A request counter in a
  ref: each render takes a number, and only the latest number may update state.

### Auto-fit layout: "fill one page, never two"

**The problem you spotted:** the same content looked half-empty on one template and fine on
another. A fixed layout can't suit both a fresher and someone with 4 jobs.

**How TeX spaces things (the 3 ideas you need):**

1. **Glue.** A gap like `6pt plus 4pt minus 1pt` is a spring: 6pt normally, it may grow by 4pt or
   shrink by 1pt. All our gaps are glue, defined once (`\sectiongap`, `\entrygap`, `\bulletgap`).
2. **`\flushbottom`** tells TeX to stretch the glue so the last line touches the bottom margin.
   Gaps grow in proportion, so section gaps stay bigger than bullet gaps.
3. **The `\vfil` trap.** `\end{document}` ends the page with `\vfil`, an _infinitely_ stretchy
   spring that swallows all spare space, so `\flushbottom` silently does nothing. We end the page
   with a plain forced break (`\penalty-10000`) instead. (We found this by looking at the PDF: it said
   "stretched" but wasn't.)

**The loop (`layout.ts`):** compile with `roomy`; 2 pages? try `spacious`, then `comfortable`,
`compact`, `dense`. The first 1-page result wins. The template prints
`TAILEX-FILL <content height> <page height>` to the log, so we know the fill. At 75 % or more we
compile once more with `\flushbottom`. Below that we don't stretch (big holes look worse than
white space at the bottom) and the UI suggests adding content.

**Why not negative `\vspace`?** It's the classic cause of overlapping lines: it pulls the next box
up into the previous one when other spacing changes. A test checks the template never uses it.

### Interview Q&A (auto-fit)

- **Why compile several times instead of estimating size from character counts?** TeX breaks
  lines and pages in whole lines and avoids stranded headings, so estimates are wrong by whole
  sections. Measuring the real output is exact, and a compile takes well under a second.
- **How do you test it without pdflatex?** `autoFitRender` takes the compiler as a parameter; the
  test passes a fake that answers "2 pages" or "fill 0.9" per layout and checks which layouts were
  tried, in what order.
- **Why no `titlesec`/`enumitem`?** Not in our minimal TeX Live; base LaTeX `list` and `\hrule`
  give the same look without hundreds of MB in the image.

---

## Commands cheat sheet

```bash
npm run dev:server / npm run dev:web    # local dev (Windows), Vite proxies /api to :8080
npm run dev:docker                      # API with real pdflatex in Docker on :8080
npm test                                # fast tests on Windows (compile tests skipped, with a warning)
npm run test:docker                     # everything, with coverage gates, in Linux
npm run lint && npm run typecheck       # code checks
```
