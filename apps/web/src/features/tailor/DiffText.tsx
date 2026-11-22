import type { DiffPart } from './word-diff.ts';

/**
 * A bullet with its changes marked: removed words struck through in red, added words highlighted
 * in green. <del> and <ins> tell screen readers about the change too, so it is not only colour.
 * Everything is rendered as plain text (never as HTML), because the words come from an AI.
 */
export function DiffText({ parts }: { parts: readonly DiffPart[] }) {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (part.kind === 'removed') {
          return (
            <del
              key={index}
              className="rounded-sm bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {part.text}
            </del>
          );
        }
        if (part.kind === 'added') {
          return (
            <ins
              key={index}
              className="rounded-sm bg-emerald-100 text-emerald-900 no-underline dark:bg-emerald-950 dark:text-emerald-200"
            >
              {part.text}
            </ins>
          );
        }
        return <span key={index}>{part.text}</span>;
      })}
    </p>
  );
}
