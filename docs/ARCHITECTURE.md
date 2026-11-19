# ARCHITECTURE — Tailex

## 1. Big picture

One container on Cloud Run runs an Express server that serves **both** the built React SPA (static files) and the `/api/*` routes. Same origin means no CORS configuration and a simpler CSP.

```mermaid
flowchart LR
  subgraph Browser
    UI[React SPA<br/>features/*]
    KH[useApiKey hook<br/>memory + optional localStorage]
    AC[api-client.ts<br/>adds x-llm-key / x-llm-provider]
    UI --> KH --> AC
  end

  subgraph CloudRun[Cloud Run container · non-root · read-only FS]
    EX[Express]
    MW[middleware<br/>helmet · CSP · rate limit · redacting logger · error handler]
    KM[requireLlmKey<br/>parse / tailor / key-test only]
    subgraph Services
      XT[extract<br/>PDF/DOCX in memory]
      RD[redact<br/>PII → placeholders]
      LLM[llm adapter<br/>allowlist → hardcoded host]
      VAL[Zod validate<br/>+ assign ids]
      KW[keywords engine<br/>skills.json]
      TG[truth guard]
      LX[latex<br/>escape · render · pdflatex sandbox]
    end
    EX --> MW
    MW --> KM --> XT --> RD --> LLM --> VAL
    KM --> LLM
    LLM --> TG
    MW --> KW
    MW --> LX
  end

  AC -- HTTPS same origin --> EX
  LLM -- HTTPS only to allowlisted host --> GEM[(Gemini API)]
  LX --> TMP["temp dir per request<br/>always deleted"]
```

## 2. Parse → render flow

```mermaid
sequenceDiagram
  autonumber
  participant U as User (browser)
  participant S as Express API
  participant X as extract + redact
  participant P as LLM provider (allowlisted)
  participant L as LaTeX compile (sandbox)

  U->>S: POST /api/parse (file, x-llm-key, x-llm-provider)
  S->>S: rate limit · size ≤ 1 MB · magic bytes
  S->>X: buffer (memory only)
  X-->>S: text with [NAME] [EMAIL] [PHONE] [LINK] + contact
  S->>P: PARSE prompt parse-v1 + <resume_text> (JSON mode, temp ≤ 0.3)
  P-->>S: JSON
  S->>S: Zod validate (retry once on invalid) · assign stable ids · drop key
  S-->>U: { resume, redactedPreview }
  U->>U: review / edit (contact re-inserted)
  U->>S: POST /api/render (resume)  — no key
  S->>L: escapeLatex(all fields) → template → pdflatex (10 s, no shell escape)
  L-->>S: PDF + page count (temp dir deleted)
  S-->>U: application/pdf → blob: URL preview
```

## 3. Key lifecycle

```mermaid
flowchart TD
  A[User pastes key] --> B{Remember on this device?}
  B -- no, default --> C[In-memory store only<br/>lost on reload]
  B -- yes --> D[Memory + localStorage]
  C & D --> E[api-client.ts sets headers<br/>x-llm-key, x-llm-provider]
  E --> F[HTTPS request to same origin]
  F --> G[requireLlmKey middleware<br/>only on /parse, /tailor, /key/test]
  G --> H[Provider adapter: one call to hardcoded host]
  H --> I[Key variable goes out of scope<br/>never logged · never stored · never echoed in errors]
  J[Clear key button] --> K[Wipe memory + localStorage]
```

## 4. Module layout (created in Phase 1)

```
cvfit/
├─ apps/
│  ├─ web/                      # Vite + React SPA
│  │  └─ src/
│  │     ├─ app/                # router, layout, stepper, theme
│  │     ├─ features/
│  │     │  ├─ api-key/         # KeyCard, useApiKey (hand-written)
│  │     │  ├─ upload/
│  │     │  ├─ review/
│  │     │  ├─ preview/
│  │     │  └─ tailor/          # keyword chips, diff list
│  │     ├─ components/ui/      # shadcn primitives
│  │     └─ lib/api-client.ts   # the ONLY place headers are attached
│  └─ server/                   # Express API + static hosting
│     └─ src/
│        ├─ routes/             # thin: validate input → call service → respond
│        ├─ middleware/         # rateLimit, requireLlmKey, logger, errors, security headers
│        ├─ services/
│        │  ├─ extract/         # pdf + docx text, magic bytes
│        │  ├─ redact/          # PII → placeholders
│        │  ├─ llm/             # LlmProvider interface, providers/{gemini,mock}, allowlist
│        │  ├─ latex/           # escapeLatex (hand-written), template, compile sandbox, log parser
│        │  ├─ keywords/        # engine + skills.json
│        │  └─ truth-guard/     # hand-written
│        └─ prompts/            # parse.ts (parse-v1), tailor.ts (tailor-v1)
└─ packages/
   └─ shared/                   # Zod schemas + inferred types + error codes
```

**Rule of thumb:** routes are thin, services are pure where possible (easy to unit test), and side effects (network, child processes) sit behind small interfaces that tests can swap for fakes.

## 5. Provider adapter

```ts
interface LlmProvider {
  readonly name: ProviderName; // "gemini" | "mock"
  generateJson(input: {
    apiKey: string;
    system: string;
    user: string;
    temperature: number;
    timeoutMs: number;
  }): Promise<unknown>; // raw JSON; the caller validates with Zod
}
```

- `getProvider(name)` looks up a **hardcoded** map. Hosts are constants in code. There is no code path that builds a URL from client input.
- Timeouts via `AbortController`, limited retries on network/5xx only.
- The `mock` provider returns fixtures (valid and malformed). It is enabled only when `NODE_ENV !== "production"` or in sample mode.

## 6. Trust boundaries

| Boundary       | Untrusted input                        | Control                                                                          |
| -------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| Browser → API  | files, JSON bodies, headers            | size limits, magic bytes, Zod, rate limit, allowlist                             |
| API → LLM      | resume/JD text (may contain injection) | PII redaction, data tags, JSON mode                                              |
| LLM → API      | model output                           | Zod validation, retry once, truth guard                                          |
| API → pdflatex | user strings                           | `escapeLatex`, no shell escape, `openin/openout_any=p`, timeout, concurrency cap |
| API → browser  | everything rendered                    | React text rendering only, no `dangerouslySetInnerHTML`, strict CSP              |

## 7. Deployment (Phase 6)

Multi-stage Dockerfile: build web + server → runtime image with Node 24 + minimal TeX Live, non-root user, read-only root FS except the temp dir, healthcheck on `/api/health`. Cloud Run: min instances 0, max 1–2, **low concurrency**, CPU/memory limits, `trust proxy` set to Cloud Run's single hop.
