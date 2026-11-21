import { Router } from 'express';
import { makeErrorResponse, RENDER_HEADERS, RenderRequestSchema } from '@tailex/shared';
import type { CompileTex } from '../services/latex/compile.ts';
import type { SlotLimiter } from '../services/latex/slot-limiter.ts';
import { autoFitRender } from '../services/latex/layout.ts';

export interface RenderRouteDeps {
  compileTex: CompileTex;
  limiter: SlotLimiter;
}

const BUSY_RETRY_AFTER_SECONDS = '5';

/**
 * POST /api/render: ResumeData in, PDF out (docs/SPEC.md §5).
 * Deliberately does NOT read x-llm-key: rendering never talks to an LLM.
 * Dependencies are passed in, so tests can use a fake compiler without pdflatex.
 */
export function createRenderRouter({ compileTex, limiter }: RenderRouteDeps): Router {
  const router = Router();

  router.post('/render', async (req, res) => {
    const parsed = RenderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      res
        .status(400)
        .json(makeErrorResponse('BAD_REQUEST', 'The resume data is invalid.', details));
      return;
    }

    const release = limiter.tryAcquire();
    if (release === null) {
      res
        .status(503)
        .set('retry-after', BUSY_RETRY_AFTER_SECONDS)
        .json(
          makeErrorResponse('BUSY', 'The PDF builder is busy. Please try again in a few seconds.'),
        );
      return;
    }

    try {
      // Tries density profiles until the resume fits one page (services/latex/layout.ts).
      const result = await autoFitRender(parsed.data.resume, compileTex);

      if (!result.ok && result.reason === 'timeout') {
        res
          .status(422)
          .json(makeErrorResponse('COMPILE_TIMEOUT', 'Building the PDF took too long.'));
        return;
      }
      if (!result.ok) {
        res
          .status(422)
          .json(makeErrorResponse('COMPILE_FAILED', 'The PDF could not be built.', result.errors));
        return;
      }

      res
        .status(200)
        .type('application/pdf')
        .set(RENDER_HEADERS.pageCount, String(result.pageCount))
        .set(RENDER_HEADERS.layout, String(result.layout))
        // Header values must be ASCII; dropped characters are often emoji, so URI-encode them.
        .set(RENDER_HEADERS.warnings, encodeURIComponent(JSON.stringify(result.droppedChars)));
      if (result.fill !== null) {
        res.set(RENDER_HEADERS.pageFill, String(Math.round(result.fill * 100)));
      }
      res.send(result.pdf);
    } finally {
      release();
    }
  });

  return router;
}
