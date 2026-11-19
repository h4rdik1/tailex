import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CompileErrorDetail } from '@tailex/shared';
import { parseLatexErrors, parsePageCount } from './log-parser.ts';

export const DEFAULT_COMPILE_TIMEOUT_MS = 10_000;
export const WORK_DIR_PREFIX = 'tailex-tex-';
const JOB_NAME = 'resume';

export type CompileResult =
  | { ok: true; pdf: Buffer; pageCount: number; log: string }
  | { ok: false; reason: 'timeout' }
  | { ok: false; reason: 'error'; errors: CompileErrorDetail[] };

export interface CompileOptions {
  timeoutMs?: number;
  /** Parent folder for the throwaway work folder. Defaults to the OS temp folder. */
  tempRoot?: string;
}

export type CompileTex = (tex: string, options?: CompileOptions) => Promise<CompileResult>;

/**
 * Compiles a .tex string to a PDF inside a throwaway folder (docs/SECURITY.md T8, T9).
 * The `log` in a successful result is for tests only; the API never sends it to the browser.
 */
export const compileTex: CompileTex = async (tex, options = {}) => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS;
  const workDir = await mkdtemp(path.join(options.tempRoot ?? tmpdir(), WORK_DIR_PREFIX));
  try {
    await writeFile(path.join(workDir, `${JOB_NAME}.tex`), tex, 'utf8');
    const run = await runPdflatex(workDir, timeoutMs);
    if (run.timedOut) return { ok: false, reason: 'timeout' };

    const log = await readLog(workDir);
    if (run.exitCode !== 0) return { ok: false, reason: 'error', errors: parseLatexErrors(log) };

    const pdf = await readFile(path.join(workDir, `${JOB_NAME}.pdf`));
    return { ok: true, pdf, pageCount: parsePageCount(log), log };
  } finally {
    // Always delete the folder, whether the compile worked, failed or timed out.
    await rm(workDir, { recursive: true, force: true });
  }
};

interface PdflatexRun {
  exitCode: number | null;
  timedOut: boolean;
}

function runPdflatex(workDir: string, timeoutMs: number): Promise<PdflatexRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pdflatex',
      ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', `${JOB_NAME}.tex`],
      {
        cwd: workDir,
        // Own process group, so on timeout we can kill pdflatex AND anything it started.
        detached: true,
        stdio: 'ignore',
        env: sandboxEnv(workDir),
      },
    );

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid);
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, timedOut });
    });
  });
}

/**
 * A minimal environment: nothing from our server's own environment is passed on except PATH.
 * The lowercase variables are read by kpathsea, TeX's file-lookup library:
 * - openin_any/openout_any = p ("paranoid"): no reading or writing of absolute paths,
 *   parent folders (..) or hidden files, outside the work folder.
 * - shell_escape = f: \write18 can never run shell commands (on top of -no-shell-escape).
 * - max_print_line: stops the log from wrapping lines, so it is easier to parse.
 */
function sandboxEnv(workDir: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: workDir,
    TEXMFOUTPUT: workDir,
    openin_any: 'p',
    openout_any: 'p',
    shell_escape: 'f',
    max_print_line: '1000',
  };
}

function killProcessGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    // A negative pid means "the whole process group" (Linux/macOS).
    process.kill(-pid, 'SIGKILL');
  } catch {
    // The process already exited between the timeout firing and this call: nothing to do.
  }
}

async function readLog(workDir: string): Promise<string> {
  try {
    // TeX logs are not guaranteed to be valid UTF-8; latin1 never fails to decode.
    return await readFile(path.join(workDir, `${JOB_NAME}.log`), 'latin1');
  } catch {
    return '';
  }
}
