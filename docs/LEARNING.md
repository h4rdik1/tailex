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

## Commands cheat sheet

```bash
npm run dev:server / npm run dev:web    # local dev (Windows), Vite proxies /api to :8080
npm run dev:docker                      # API with real pdflatex in Docker on :8080
npm test                                # fast tests on Windows (compile tests skipped, with a warning)
npm run test:docker                     # everything, with coverage gates, in Linux
npm run lint && npm run typecheck       # code checks
```
