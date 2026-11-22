/** "Before → after" match score, with a bar for the current score and a tick for where it started. */
export function ScoreMeter({ before, after }: { before: number; after: number }) {
  const change = after - before;
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">Match score </span>
        <span>{before}%</span>
        <span aria-hidden="true"> → </span>
        <span className="sr-only"> to </span>
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{after}%</span>
        {change !== 0 && (
          <span className="text-zinc-500 dark:text-zinc-400">
            {' '}
            ({change > 0 ? '+' : ''}
            {change})
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Match score after your changes"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={after}
        className="relative h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width]"
          style={{ width: `${String(after)}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute top-0 h-full w-0.5 bg-zinc-900 dark:bg-zinc-100"
          style={{ left: `${String(before)}%` }}
        />
      </div>
    </div>
  );
}
