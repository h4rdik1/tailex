import { Card } from '../../components/ui/card.tsx';
import { Hint } from '../../components/ui/fields.tsx';

/**
 * Shows the exact text that went to the AI provider, after contact details were replaced by
 * [NAME] [EMAIL] [PHONE] [LINK]. Rendered as plain text in a <pre> (never as HTML).
 * A native <details> is keyboard- and screen-reader-friendly with no extra code.
 */
export function SeeWhatsSent({ text, isSample }: { text: string; isSample: boolean }) {
  return (
    <Card>
      <details className="group p-4">
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-500">
          See what&apos;s sent to the AI
        </summary>
        <Hint className="mt-2">
          {isSample
            ? 'Sample mode made no AI call. This is what would be sent for the sample resume.'
            : 'Redaction is best-effort: check that nothing private slipped through.'}
        </Hint>
        <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-zinc-100 p-3 font-mono text-xs whitespace-pre-wrap dark:bg-zinc-950">
          {text}
        </pre>
      </details>
    </Card>
  );
}
