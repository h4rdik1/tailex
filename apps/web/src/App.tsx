const STEPS = ['Upload', 'Review', 'Preview', 'Tailor', 'Export'] as const;

/** Phase 1 shell. The real stepper, key card and split view arrive in Phase 4. */
export function App() {
  return (
    <div className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="font-mono text-lg font-semibold">
          tail<span className="text-emerald-600 dark:text-emerald-400">ex</span>
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Tailor your resume without inventing anything.</h1>

        <ol aria-label="Steps" className="mt-8 flex flex-wrap gap-2 font-mono text-sm">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="rounded-md border border-zinc-200 px-3 py-1.5 dark:border-zinc-800"
            >
              <span className="text-emerald-600 dark:text-emerald-400">{index + 1}</span> {step}
            </li>
          ))}
        </ol>

        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
          Your resume text, with contact details removed, is sent to your chosen LLM provider. We
          store nothing.
        </p>
      </main>
    </div>
  );
}
