# SECURITY — Tailex

## Reporting a vulnerability
Please **do not open a public issue** for security problems. Use GitHub's **private vulnerability reporting** ("Security" tab → "Report a vulnerability") on this repository. Include steps to reproduce and impact. Expect an acknowledgement within 7 days. Please don't test against other users or with real personal data. This is a portfolio project with no SLA, but reports are taken seriously and credited if you wish.

## Security principles
1. **Store nothing.** No database, no accounts, no file writes except an ephemeral compile dir.
2. **Every input is untrusted:** uploads, JD text, headers, **and LLM output**.
3. **Prompts are not security.** Code validation (Zod, truth guard, escaping) is.
4. **Least privilege:** non-root container, read-only FS, outbound calls only to allowlisted hosts.

## Assets
| Asset | Why it matters |
|---|---|
| User's LLM API key | Can spend the user's quota or money |
| Resume content + PII | Personal data |
| Server compute | pdflatex is CPU-heavy; abuse = cost + denial of service |
| Container filesystem | Must not be readable via LaTeX |

## Threat model
| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | **Malicious upload** (oversize, polyglot, fake extension, zip bomb DOCX) | ≤ 1 MB limit before parsing; **magic bytes** check; DOCX uncompressed-size cap; in-memory only (`multer.memoryStorage`), never written to disk; extraction timeout | oversize, wrong type, bad magic bytes, renamed `.exe` |
| T2 | **Untrusted LLM output** (wrong shape, oversized, injected text, fabricated facts) | Zod schema with length limits; retry once then `PARSE_INVALID_OUTPUT`; ids assigned in code; truth guard for tailoring; rendered as plain text only | malformed/oversized mock outputs; guard fabrication tests |
| T3 | **Prompt injection** in resume/JD ("ignore previous instructions…") | Data wrapped in `<resume_text>`/`<jd>`/`<bullets>` tags; JSON mode; output still passes Zod + guard; LLM has no tools and can't take actions | injection fixture yields valid or rejected output, never side effects |
| T4 | **API key leakage** | Headers only (`x-llm-key`), HTTPS only; read only by `requireLlmKey` on `/api/parse`, `/api/tailor`, `/api/key/test`; logger redacts the header and never logs bodies; errors are mapped to safe codes (provider errors are not echoed); no analytics on key fields; no cookies | **log-capture test**: key never appears in logs or error responses; test that `/api/render` and `/api/keywords` never read the key |
| T5 | **Key theft in the browser** | Memory by default; localStorage only when opted in (with a warning); Clear button wipes both; strict CSP + no raw HTML to limit XSS | `useApiKey` tests: remember on/off, clear |
| T6 | **SSRF** via provider | Client sends a provider **name** only; server maps it to a **hardcoded** host; unknown names → 400; URL-like values rejected; no code path builds a URL from input | fake provider name and custom URL are rejected |
| T7 | **XSS** | React text rendering only; **no `dangerouslySetInnerHTML`** (ESLint rule); helmet; strict CSP (below) | lint rule; CSP header test |
| T8 | **LaTeX injection** (`\input{/etc/passwd}`, `\write18`, `\catcode`, `^^` notation) | `escapeLatex` on every field (`& % $ # _ { } ~ ^ \`); `-no-shell-escape`; `openin_any=p`, `openout_any=p`; template-only rendering, users never submit LaTeX | per-character tests + fuzz + injection payloads in bullets |
| T9 | **Compile DoS** (huge input, infinite loops) | Zod length limits; 10 s hard timeout that **kills the process tree**; **global cap on concurrent pdflatex runs** (small semaphore, excess requests get `503 BUSY`); unique temp dir always deleted (`finally`) | compile-timeout test; concurrency-cap test; temp dir removed on success and failure |
| T10 | **Abuse / cost** | Per-IP rate limit on all endpoints (stricter on `/parse`, `/tailor`, `/render`); `app.set("trust proxy", 1)` for Cloud Run; Cloud Run **max instances 1–2** and **low concurrency**; CPU/memory limits | rate-limit test (429) |
| T11 | **Supply chain** | Exact-pinned deps; lockfile committed; `npm audit` in CI; every new dependency approved by the owner | CI job |
| T12 | **Secrets in repo** | `.env.example` only; `.env` gitignored; no owner key used anywhere | review + gitignore |
| T13 | **Real personal data in repo** | Samples and fixtures use **fictional people only** | fixture review |

## Content-Security-Policy (target, Phase 6)
```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
frame-src 'self' blob:;
object-src blob:;
base-uri 'none';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```
- `blob:` is allowed **only** for the PDF preview (`frame-src`/`object-src`), since the compiled PDF is shown via `URL.createObjectURL`.
- `style-src` may need a narrow adjustment if a component injects inline styles. Any change gets an ADR.
- Analytics (once chosen) adds exactly its one origin to `script-src`/`connect-src`.
- Other headers via helmet: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` with everything disabled.

## Container hardening (Phases 2 and 6)
Multi-stage build, non-root user, read-only root FS with a writable temp dir only, healthcheck, CPU/memory limits, minimal TeX Live (only the packages the template needs).

## Logging
- Structured logger with `x-llm-key`, `authorization` and `cookie` redacted.
- Logs method, path, status and duration only. **Never** bodies, file contents, resume text, JD text or LLM output.
- **Hosting logs:** Cloud Run's platform request logs may record IP address, user agent and timestamps. They never contain request bodies or keys, because keys travel in headers that Cloud Run does not log.
