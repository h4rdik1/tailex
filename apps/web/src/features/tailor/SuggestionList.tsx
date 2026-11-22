import { useMemo } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { Hint } from '../../components/ui/fields.tsx';
import { Badge } from '../../components/ui/misc.tsx';
import { DiffText } from './DiffText.tsx';
import type { SuggestionMeta, SuggestionStatus, SuggestionView } from './useTailor.ts';
import { diffWords } from './word-diff.ts';

interface SuggestionListProps {
  views: readonly SuggestionView[];
  meta: SuggestionMeta | null;
  statusOf: (view: SuggestionView) => SuggestionStatus;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
}

const STATUS_BADGE: Record<
  SuggestionStatus,
  { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }
> = {
  ok: { tone: 'success', label: 'Passed the truth check' },
  blocked: { tone: 'danger', label: 'Blocked' },
  outdated: { tone: 'warning', label: 'Bullet changed since' },
  accepted: { tone: 'success', label: 'Accepted' },
  rejected: { tone: 'neutral', label: 'Rejected' },
};

/**
 * The rewrites, one card each, with the changes marked word by word. A rewrite the truth check
 * blocked is shown with its reason and has no Accept button; it is never hidden.
 */
export function SuggestionList({
  views,
  meta,
  statusOf,
  onAccept,
  onReject,
  onAcceptAll,
}: SuggestionListProps) {
  const statuses = views.map(statusOf);
  const ready = statuses.filter((status) => status === 'ok').length;
  const blocked = statuses.filter((status) => status === 'blocked').length;

  // Word diffs are computed once per suggestion, not on every render.
  const diffs = useMemo(
    () => views.map((view) => diffWords(view.suggestion.original, view.suggestion.suggested)),
    [views],
  );

  if (views.length === 0) {
    return (
      <Hint role="status">
        {meta === null
          ? ''
          : 'The AI found nothing worth rewording. Your bullets already fit this job description.'}
      </Hint>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm">
        {views.length} suggestion{views.length === 1 ? '' : 's'}: {ready} ready to accept
        {blocked > 0 ? `, ${String(blocked)} blocked` : ''}.
      </p>
      {blocked > 0 && (
        <Hint>
          The truth check is strict on purpose. It can block a rewrite that is actually true, for
          example when a number is spelled out ("two hundred" vs "200"). If so, edit the bullet
          yourself on the Review step. It never lets an invented skill, number or name through, and
          it cannot judge meaning, so read every rewrite before you accept it.
        </Hint>
      )}
      {meta !== null && meta.bulletsConsidered < meta.bulletsTotal && (
        <Hint>
          Only the first {meta.bulletsConsidered} of your {meta.bulletsTotal} bullets were checked.
        </Hint>
      )}
      <div>
        <Button size="sm" disabled={ready === 0} onClick={onAcceptAll}>
          {ready === 0 ? 'Accept all' : `Accept all ${String(ready)} that passed`}
        </Button>
      </div>

      <ol aria-label="Suggested rewrites" className="flex flex-col gap-3">
        {views.map((view, index) => {
          const status = statuses[index] ?? 'ok';
          const badge = STATUS_BADGE[status];
          const { suggestion } = view;
          return (
            <li key={suggestion.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Rewrite {index + 1} of {views.length}
                    </span>
                  </div>

                  <DiffText parts={diffs[index] ?? []} />
                  <Hint>{suggestion.reason}</Hint>

                  {status === 'blocked' && (
                    <p role="note" className="text-sm text-red-700 dark:text-red-400">
                      Not accepted: {suggestion.blockedReason ?? 'it did not pass the truth check.'}
                    </p>
                  )}
                  {status === 'outdated' && (
                    <p role="note" className="text-sm text-amber-700 dark:text-amber-400">
                      You edited or deleted this bullet after the rewrite was made, so it can no
                      longer be applied. Ask for new suggestions to update it.
                    </p>
                  )}

                  {status === 'ok' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        aria-label={`Accept rewrite ${String(index + 1)}`}
                        onClick={() => {
                          onAccept(suggestion.id);
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Reject rewrite ${String(index + 1)}`}
                        onClick={() => {
                          onReject(suggestion.id);
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
