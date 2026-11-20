import {
  ErrorResponseSchema,
  KeyTestResponseSchema,
  LLM_HEADERS,
  ParseResponseSchema,
  RENDER_HEADERS,
  type CompileErrorDetail,
  type ErrorCode,
  type ParseResponse,
  type PublicProvider,
  type ResumeData,
  type Spacing,
} from '@tailex/shared';
import { ERROR_MESSAGES, type ClientErrorCode } from './error-messages.ts';

/**
 * THE only place in the browser that attaches the user's key (CLAUDE.md, Security musts).
 * The key goes in the x-llm-key header, over HTTPS, same origin. Never in a URL, query or body.
 * Only parse, key-test (and tailor, Phase 5) send it; health and render never do.
 */

/** Where the client reads the current key from (useApiKey owns the actual state). */
export interface KeySource {
  getKey(): string;
  getProvider(): PublicProvider;
}

export class ApiError extends Error {
  readonly code: ErrorCode | ClientErrorCode;
  readonly status: number;
  /** Readable compile errors for COMPILE_FAILED; field problems for BAD_REQUEST. */
  readonly details: unknown;

  constructor(code: ErrorCode | ClientErrorCode, status: number, details?: unknown) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get compileErrors(): CompileErrorDetail[] {
    return this.code === 'COMPILE_FAILED' && Array.isArray(this.details)
      ? (this.details as CompileErrorDetail[])
      : [];
  }
}

export interface RenderedPdf {
  pdf: Blob;
  pageCount: number;
  /** Characters the PDF fonts could not print (e.g. emoji), already removed. */
  droppedChars: string[];
}

export interface ApiClient {
  health(): Promise<boolean>;
  testKey(): Promise<void>;
  parse(file: Blob): Promise<ParseResponse>;
  render(resume: ResumeData, spacing: Spacing): Promise<RenderedPdf>;
}

export function createApiClient(keys: KeySource, fetchFn: typeof fetch = fetch): ApiClient {
  /** Headers for the three endpoints that need the key. Fails early if there is no key. */
  function keyHeaders(): Record<string, string> {
    const key = keys.getKey();
    if (key === '') throw new ApiError('KEY_MISSING', 0);
    return { [LLM_HEADERS.key]: key, [LLM_HEADERS.provider]: keys.getProvider() };
  }

  async function send(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetchFn(path, init);
    } catch {
      throw new ApiError('NETWORK', 0);
    }
    if (!response.ok) throw await toApiError(response);
    return response;
  }

  return {
    async health() {
      try {
        return (await fetchFn('/api/health', { cache: 'no-store' })).ok;
      } catch {
        return false;
      }
    },

    async testKey() {
      const response = await send('/api/key/test', { method: 'POST', headers: keyHeaders() });
      parseOrThrow(KeyTestResponseSchema, await response.json());
    },

    async parse(file) {
      const response = await send('/api/parse', {
        method: 'POST',
        // The raw file is the body (docs/DECISIONS.md ADR-026); the server checks magic bytes.
        headers: { ...keyHeaders(), 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      return parseOrThrow(ParseResponseSchema, await response.json());
    },

    async render(resume, spacing) {
      const response = await send('/api/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' }, // no key: rendering never uses the LLM
        body: JSON.stringify({ resume, spacing }),
      });
      return {
        pdf: await response.blob(),
        pageCount: Number(response.headers.get(RENDER_HEADERS.pageCount) ?? '0'),
        droppedChars: readDroppedChars(response.headers.get(RENDER_HEADERS.warnings)),
      };
    },
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = ErrorResponseSchema.safeParse(body);
  if (!parsed.success) return new ApiError('BAD_RESPONSE', response.status);
  return new ApiError(parsed.data.error.code, response.status, parsed.data.error.details);
}

/** Server answers are checked too: the UI should never act on a malformed response. */
function parseOrThrow<T>(
  schema: { safeParse(data: unknown): { success: true; data: T } | { success: false } },
  data: unknown,
): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiError('BAD_RESPONSE', 200);
  return result.data;
}

function readDroppedChars(header: string | null): string[] {
  if (header === null) return [];
  try {
    const value: unknown = JSON.parse(decodeURIComponent(header));
    return Array.isArray(value) ? value.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}
