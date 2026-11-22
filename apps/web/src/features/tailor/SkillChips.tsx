import { Button } from '../../components/ui/button.tsx';
import { Hint, Label } from '../../components/ui/fields.tsx';
import { Badge, Checkbox } from '../../components/ui/misc.tsx';
import type { Analysis } from './useTailor.ts';

interface SkillChipsProps {
  analysis: Analysis;
  ticked: readonly string[];
  confirmed: readonly string[];
  onToggle: (skill: string) => void;
  onAdd: () => void;
}

/**
 * The job description's skills in three groups: matched (green), missing (amber, tickable) and
 * "not in the job description" (neutral). Only a skill the user ticks is ever added, and only
 * from this list (the server rejects any other name).
 */
export function SkillChips({ analysis, ticked, confirmed, onToggle, onAdd }: SkillChipsProps) {
  const { matched, missing, extra } = analysis.current;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="matched-heading" className="flex flex-col gap-2">
        <h3 id="matched-heading" className="text-sm font-semibold">
          Already on your resume ({matched.length})
        </h3>
        {matched.length === 0 ? (
          <Hint>None of the skills in this job description are on your resume yet.</Hint>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {matched.map((skill) => (
              <li key={skill}>
                <Badge tone="success">{skill}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="missing-heading" className="flex flex-col gap-2">
        <h3 id="missing-heading" className="text-sm font-semibold">
          Asked for, but not on your resume ({missing.length})
        </h3>
        {missing.length === 0 ? (
          <Hint>Nothing is missing: your resume already shows every skill the job asks for.</Hint>
        ) : (
          <>
            <Hint>
              Tick <strong>only the skills you really have</strong>. Only ticked skills are added,
              to your Skills section.
            </Hint>
            <ul className="flex flex-col gap-1.5">
              {missing.map((item) => {
                const id = `missing-${item.skill}`;
                return (
                  <li key={item.skill} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={ticked.includes(item.skill)}
                      onCheckedChange={() => {
                        onToggle(item.skill);
                      }}
                    />
                    <Label htmlFor={id} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{item.skill}</span>
                      <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        {item.category}
                      </span>
                      {item.required && <Badge tone="warning">required</Badge>}
                    </Label>
                  </li>
                );
              })}
            </ul>
            <div>
              <Button size="sm" disabled={ticked.length === 0} onClick={onAdd}>
                {ticked.length === 0
                  ? 'Add selected to Skills'
                  : `Add ${String(ticked.length)} selected to Skills`}
              </Button>
            </div>
          </>
        )}
        {confirmed.length > 0 && (
          <Hint>
            Added so far: <span className="font-mono">{confirmed.join(', ')}</span>
          </Hint>
        )}
      </section>

      {extra.length > 0 && (
        <section aria-labelledby="extra-heading" className="flex flex-col gap-2">
          <h3 id="extra-heading" className="text-sm font-semibold">
            On your resume, not in this job description ({extra.length})
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {extra.map((skill) => (
              <li key={skill}>
                <Badge>{skill}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
