import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { Hint } from '../../components/ui/fields.tsx';
import { PdfLinks } from './PdfPanel.tsx';
import type { RenderState } from './usePdfRender.ts';

/** Step 5: download the PDF that matches the current edits. */
export function ExportStep({
  state,
  outOfDate,
  onRender,
}: {
  state: RenderState;
  outOfDate: boolean;
  onRender: () => void;
}) {
  const ready = state.status === 'ready' && !outOfDate;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        {ready ? (
          <>
            <p className="text-sm">Your PDF matches your latest edits.</p>
            <PdfLinks url={state.url} />
          </>
        ) : (
          <>
            <p className="text-sm">
              {state.status === 'ready'
                ? 'You changed the resume since the last PDF. Build it again first.'
                : 'Build the PDF first.'}
            </p>
            <div>
              <Button disabled={state.status === 'rendering'} onClick={onRender}>
                {state.status === 'rendering' ? 'Building…' : 'Build PDF'}
              </Button>
            </div>
          </>
        )}
        <Hint>Nothing is stored on our server: once you close this tab, it is gone.</Hint>
      </CardContent>
    </Card>
  );
}
