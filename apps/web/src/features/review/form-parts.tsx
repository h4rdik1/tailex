import { useId, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { Bullet } from '@tailex/shared';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Hint, Input, Label, Textarea } from '../../components/ui/fields.tsx';

/** One labelled text field. `useId` links the label to the input for screen readers. */
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className ?? 'flex flex-col gap-1.5'}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </div>
  );
}

/**
 * A comma-separated list ("React, Node.js"). The user types freely in a local draft; the list
 * is only split and saved on blur, so typing a comma or space never gets swallowed mid-word.
 * The parent gives it a `key` built from the saved list, so outside changes reset the draft.
 */
export function CommaListField({
  label,
  items,
  onCommit,
}: {
  label: string;
  items: string[];
  onCommit: (items: string[]) => void;
}) {
  const id = useId();
  const hintId = useId();
  const [draft, setDraft] = useState(items.join(', '));
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={draft}
        aria-describedby={hintId}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          onCommit(splitList(draft));
        }}
      />
      <Hint id={hintId}>Separate with commas.</Hint>
    </div>
  );
}

export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** A card for one resume section, with an optional "Add" button in its header. */
export function SectionCard({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  addLabel?: string;
  onAdd?: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {onAdd && addLabel && (
          <Button variant="ghost" size="sm" onClick={onAdd}>
            <Plus className="size-4" aria-hidden="true" />
            {addLabel}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

/** A bordered box for one entry (a job, a project…) with a labelled Remove button. */
export function EntryBox({
  removeLabel,
  onRemove,
  children,
}: {
  removeLabel: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      {children}
      <div>
        <Button variant="danger" size="sm" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden="true" />
          {removeLabel}
        </Button>
      </div>
    </div>
  );
}

/** Editable bullets with move up/down and remove. Every icon button has a spoken label. */
export function BulletList({
  owner,
  bullets,
  onChange,
  onAdd,
  onRemove,
  onMove,
}: {
  owner: string;
  bullets: Bullet[];
  onChange: (id: string, text: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, by: -1 | 1) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Bullets</legend>
      {bullets.map((bullet, index) => {
        const name = `${owner} bullet ${String(index + 1)}`;
        return (
          <div key={bullet.id} className="flex items-start gap-1">
            <Textarea
              aria-label={name}
              value={bullet.text}
              onChange={(event) => {
                onChange(bullet.id, event.target.value);
              }}
            />
            <div className="flex flex-col">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move ${name} up`}
                disabled={index === 0}
                onClick={() => {
                  onMove(bullet.id, -1);
                }}
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move ${name} down`}
                disabled={index === bullets.length - 1}
                onClick={() => {
                  onMove(bullet.id, 1);
                }}
              >
                <ArrowDown className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  onRemove(bullet.id);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        );
      })}
      <div>
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Add bullet
        </Button>
      </div>
    </fieldset>
  );
}
