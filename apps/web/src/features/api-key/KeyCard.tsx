import { useId, useState } from 'react';
import { ChevronDown, KeyRound } from 'lucide-react';
import { Collapsible } from 'radix-ui';
import { PublicProviderSchema, type PublicProvider } from '@tailex/shared';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { FieldError, Hint, Input, Label, Select } from '../../components/ui/fields.tsx';
import { Badge, Checkbox } from '../../components/ui/misc.tsx';
import { ApiError } from '../../lib/api-client.ts';
import type { ApiKeyState } from './useApiKey.ts';

/** A Record keyed by provider, so TypeScript forces an entry for every provider we allow. */
const PROVIDERS: Record<PublicProvider, { label: string; keyUrl: string }> = {
  gemini: { label: 'Google Gemini', keyUrl: 'https://aistudio.google.com/apikey' },
};

/** The test result belongs to one exact key: typing a different key makes it stale. */
type TestResult =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; forKey: string }
  | { state: 'failed'; message: string };

interface KeyCardProps {
  apiKey: ApiKeyState;
  testKey: () => Promise<void>;
}

/**
 * "Bring your own key" card at the top of the page. Collapsed once a key is set so it stays
 * out of the way; the status badge stays visible in the header either way.
 */
export function KeyCard({ apiKey, testKey }: KeyCardProps) {
  const [open, setOpen] = useState(apiKey.key === '');
  const [test, setTest] = useState<TestResult>({ state: 'idle' });
  const ids = {
    heading: useId(),
    key: useId(),
    keyHint: useId(),
    provider: useId(),
    remember: useId(),
  };

  const verified = test.state === 'ok' && test.forKey === apiKey.key && apiKey.key !== '';
  const provider = PROVIDERS[apiKey.provider];

  async function runTest(): Promise<void> {
    const forKey = apiKey.key;
    setTest({ state: 'testing' });
    try {
      await testKey();
      setTest({ state: 'ok', forKey });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'The key test failed.';
      setTest({ state: 'failed', message });
    }
  }

  return (
    <Card aria-labelledby={ids.heading}>
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <KeyRound
              className="size-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <h2 id={ids.heading} className="text-base font-semibold">
              Your API key
            </h2>
            <KeyStatusBadge status={apiKey.status} verified={verified} />
          </div>
          <Collapsible.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={open ? 'Hide key settings' : 'Show key settings'}
            >
              <ChevronDown
                className={
                  open ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'
                }
                aria-hidden="true"
              />
            </Button>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content className="flex flex-col gap-4 px-4 pb-4">
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.provider}>Provider</Label>
              <Select
                id={ids.provider}
                value={apiKey.provider}
                onChange={(event) => {
                  // The value comes from the DOM as a plain string: check it before using it.
                  const next = PublicProviderSchema.safeParse(event.target.value);
                  if (next.success) apiKey.setProvider(next.data);
                }}
              >
                {PublicProviderSchema.options.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDERS[id].label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.key}>API key</Label>
              <Input
                id={ids.key}
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                value={apiKey.key}
                aria-describedby={ids.keyHint}
                onChange={(event) => {
                  apiKey.setKey(event.target.value);
                }}
              />
              <Hint id={ids.keyHint}>
                Kept in this tab only and sent in a header to your provider via our server, which
                never stores or logs it.{' '}
                <a
                  className="text-emerald-700 underline dark:text-emerald-400"
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Get a free key
                </a>
              </Hint>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id={ids.remember}
              checked={apiKey.remember}
              onCheckedChange={(checked) => {
                apiKey.setRemember(checked === true);
              }}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor={ids.remember}>Remember on this device</Label>
              <Hint>
                Saves the key in this browser&apos;s storage. Only use this on your own device.
              </Hint>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={apiKey.key === '' || test.state === 'testing'}
              onClick={() => {
                void runTest();
              }}
            >
              {test.state === 'testing' ? 'Testing…' : 'Test key'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={apiKey.key === '' && !apiKey.remember}
              onClick={() => {
                apiKey.clear();
                setTest({ state: 'idle' });
              }}
            >
              Clear key
            </Button>
            <p aria-live="polite" className="text-sm">
              {verified && (
                <span className="text-emerald-700 dark:text-emerald-400">Key works.</span>
              )}
            </p>
          </div>
          {test.state === 'failed' && <FieldError>{test.message}</FieldError>}

          <Hint>
            Free-tier keys may let the provider use your text to improve its models. The text we
            send has your contact details removed.
          </Hint>
        </Collapsible.Content>
      </Collapsible.Root>
    </Card>
  );
}

function KeyStatusBadge({
  status,
  verified,
}: {
  status: ApiKeyState['status'];
  verified: boolean;
}) {
  if (verified) return <Badge tone="success">Verified</Badge>;
  switch (status) {
    case 'none':
      return <Badge tone="warning">No key</Badge>;
    case 'in-memory':
      return <Badge>In memory</Badge>;
    case 'remembered':
      return <Badge>Remembered</Badge>;
  }
}
