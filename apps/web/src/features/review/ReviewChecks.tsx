import type { ResumeProblem } from './check-resume.ts';

/**
 * Problems that block rendering (schema errors) and placeholders the user should fix.
 * role="status" so screen readers hear the list change while the user edits.
 */
export function ReviewChecks({
  problems,
  placeholders,
}: {
  problems: ResumeProblem[];
  placeholders: string[];
}) {
  if (problems.length === 0 && placeholders.length === 0) return null;
  return (
    <div role="status" className="flex flex-col gap-3">
      {problems.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <p className="font-semibold">Fix these before building the PDF:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((problem) => (
              <li key={`${problem.where}:${problem.message}`}>
                <span className="font-mono">{problem.where}</span>: {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {placeholders.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <p className="font-semibold">
            These fields still contain a placeholder like <span className="font-mono">[LINK]</span>.
            Replace it with the real text:
          </p>
          <ul className="mt-1 list-disc pl-5 font-mono">
            {placeholders.map((where) => (
              <li key={where}>{where}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
