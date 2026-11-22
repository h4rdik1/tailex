import { TAILOR_LIMITS } from '@tailex/shared';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { FieldError, Hint, Input, Label } from '../../components/ui/fields.tsx';
import { JdInput } from './JdInput.tsx';
import { ScoreMeter } from './ScoreMeter.tsx';
import { SkillChips } from './SkillChips.tsx';
import { SuggestionList } from './SuggestionList.tsx';
import type { TailorController } from './useTailor.ts';

interface TailorStepProps {
  tailor: TailorController;
  isSample: boolean;
  onPreview: () => void;
  onContinue: () => void;
}

/**
 * Step 4: paste a job description, see which skills it asks for, tick the ones you really have,
 * then review the AI's bullet rewrites one by one. Nothing changes your resume until you click.
 */
export function TailorStep({ tailor, isSample, onPreview, onContinue }: TailorStepProps) {
  const { analysis } = tailor;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-4">
          <JdInput
            value={tailor.jd}
            onChange={tailor.setJd}
            onAnalyze={() => {
              void tailor.analyze();
            }}
            busy={tailor.busy === 'analyzing'}
            invalid={tailor.error !== null}
          />
        </CardContent>
      </Card>

      <p role="status" className="min-h-5 text-sm text-zinc-600 dark:text-zinc-400">
        {tailor.busy === 'analyzing' && 'Comparing the job description with your resume…'}
        {tailor.busy === 'suggesting' && 'Asking the AI for rewrites. This takes a few seconds…'}
        {tailor.busy === 'idle' && tailor.notice}
      </p>

      {tailor.error !== null && <FieldError>{tailor.error}</FieldError>}

      {analysis !== null && (
        <>
          {tailor.jdChanged && (
            <p role="note" className="text-sm text-amber-700 dark:text-amber-400">
              You changed the job description. Click Analyze to update the results below.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Skills the job asks for</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {analysis.current.jdSkillCount === 0 ? (
                <Hint role="status">
                  We did not recognise any skills in this job description. Try pasting the
                  requirements or qualifications section.
                </Hint>
              ) : (
                <>
                  <ScoreMeter before={analysis.baseline.score} after={analysis.current.score} />
                  <SkillChips
                    analysis={analysis}
                    ticked={tailor.ticked}
                    confirmed={tailor.confirmed}
                    onToggle={tailor.toggle}
                    onAdd={tailor.addTicked}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reword your bullets</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Hint>
                The AI may reword your bullets with the job description&apos;s terms. It may not add
                skills, tools, employers or numbers, and every rewrite is checked by code first.{' '}
                {isSample
                  ? 'This is the sample: no key is used and no AI is called.'
                  : 'Your resume text, with contact details removed, and the job description are sent to your AI provider using your key.'}
              </Hint>
              <div className="flex flex-col gap-2">
                <Label htmlFor="target-role">Role you are aiming for (optional)</Label>
                <Input
                  id="target-role"
                  value={tailor.preferences.targetRole}
                  maxLength={TAILOR_LIMITS.targetRole}
                  placeholder="e.g. Backend Engineer"
                  onChange={(event) => {
                    tailor.setPreferences({
                      ...tailor.preferences,
                      targetRole: event.target.value,
                    });
                  }}
                />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={tailor.preferences.keepSeniority}
                    onChange={(event) => {
                      tailor.setPreferences({
                        ...tailor.preferences,
                        keepSeniority: event.target.checked,
                      });
                    }}
                  />
                  <span>
                    Keep my seniority: do not make me sound more senior or more in charge than my
                    bullets say.
                  </span>
                </label>
              </div>
              <div>
                <Button
                  disabled={tailor.busy !== 'idle' || tailor.jdChanged}
                  onClick={() => {
                    void tailor.suggest();
                  }}
                >
                  {tailor.busy === 'suggesting'
                    ? 'Working…'
                    : tailor.suggestions.length > 0
                      ? 'Suggest again'
                      : 'Suggest bullet rewrites'}
                </Button>
              </div>
              <SuggestionList
                views={tailor.suggestions}
                meta={tailor.meta}
                statusOf={tailor.statusOf}
                onAccept={tailor.accept}
                onReject={tailor.reject}
                onAcceptAll={tailor.acceptAll}
              />
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={onPreview}>Preview PDF</Button>
        <Button variant="secondary" onClick={onContinue}>
          Continue to download
        </Button>
      </div>
    </div>
  );
}
