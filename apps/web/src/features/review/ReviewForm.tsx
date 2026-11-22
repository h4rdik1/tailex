import type { Dispatch } from 'react';
import type { ResumeData } from '@tailex/shared';
import { Hint } from '../../components/ui/fields.tsx';
import { newId, type BulletSection, type ResumeAction } from './resume-reducer.ts';
import { BulletList, CommaListField, EntryBox, SectionCard, TextField } from './form-parts.tsx';

interface ReviewFormProps {
  resume: ResumeData;
  dispatch: Dispatch<ResumeAction>;
}

/**
 * The whole resume as a controlled form: every field shows the state and every change is an
 * action for resumeReducer. The form itself holds no resume data.
 */
export function ReviewForm({ resume, dispatch }: ReviewFormProps) {
  function bulletHandlers(section: BulletSection, entryId: string) {
    return {
      onChange: (id: string, text: string) => {
        dispatch({ type: 'setBullet', section, entryId, id, text });
      },
      onAdd: () => {
        dispatch({ type: 'addBullet', section, entryId, id: newId('b') });
      },
      onRemove: (id: string) => {
        dispatch({ type: 'removeBullet', section, entryId, id });
      },
      onMove: (id: string, by: -1 | 1) => {
        dispatch({ type: 'moveBullet', section, entryId, id, by });
      },
    };
  }

  const { contact } = resume;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Contact"
        addLabel="Add link"
        onAdd={() => {
          dispatch({ type: 'addLink', id: newId('link') });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Name"
            value={contact.name}
            onChange={(value) => {
              dispatch({ type: 'setContact', field: 'name', value });
            }}
          />
          <TextField
            label="Email"
            value={contact.email}
            onChange={(value) => {
              dispatch({ type: 'setContact', field: 'email', value });
            }}
          />
          <TextField
            label="Phone"
            value={contact.phone}
            onChange={(value) => {
              dispatch({ type: 'setContact', field: 'phone', value });
            }}
          />
          <TextField
            label="Location"
            value={contact.location}
            onChange={(value) => {
              dispatch({ type: 'setContact', field: 'location', value });
            }}
          />
          <TextField
            label="Headline (job title under your name, optional)"
            className="flex flex-col gap-1.5 sm:col-span-2"
            value={resume.headline}
            onChange={(value) => {
              dispatch({ type: 'setHeadline', value });
            }}
          />
        </div>
        {contact.links.map((link, index) => (
          <EntryBox
            key={link.id}
            removeLabel={`Remove link ${String(index + 1)}`}
            onRemove={() => {
              dispatch({ type: 'removeItem', section: 'links', id: link.id });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={`Link ${String(index + 1)} text`}
                value={link.label}
                onChange={(value) => {
                  dispatch({ type: 'setLink', id: link.id, field: 'label', value });
                }}
              />
              <TextField
                label={`Link ${String(index + 1)} URL`}
                value={link.url}
                onChange={(value) => {
                  dispatch({ type: 'setLink', id: link.id, field: 'url', value });
                }}
              />
            </div>
          </EntryBox>
        ))}
      </SectionCard>

      <SectionCard title="Summary (optional)">
        <TextField
          label="Summary paragraph"
          multiline
          value={resume.summary}
          onChange={(value) => {
            dispatch({ type: 'setSummary', value });
          }}
        />
        <Hint>Leave it empty and the PDF has no Summary section.</Hint>
      </SectionCard>

      <SectionCard
        title="Skills"
        addLabel="Add group"
        onAdd={() => {
          dispatch({ type: 'addSkillGroup', id: newId('skills') });
        }}
      >
        {resume.skills.map((group, index) => (
          <EntryBox
            key={group.id}
            removeLabel={`Remove skill group ${String(index + 1)}`}
            onRemove={() => {
              dispatch({ type: 'removeItem', section: 'skills', id: group.id });
            }}
          >
            <TextField
              label="Category"
              value={group.category}
              onChange={(category) => {
                dispatch({ type: 'setSkillGroup', id: group.id, category });
              }}
            />
            <CommaListField
              key={group.items.join('\n')}
              label="Skills"
              items={group.items}
              onCommit={(items) => {
                dispatch({ type: 'setSkillGroup', id: group.id, items });
              }}
            />
          </EntryBox>
        ))}
      </SectionCard>

      <SectionCard
        title="Experience"
        addLabel="Add job"
        onAdd={() => {
          dispatch({ type: 'addEntry', section: 'experience', id: newId('exp') });
        }}
      >
        {resume.experience.map((job, index) => {
          const owner = `Job ${String(index + 1)}`;
          return (
            <EntryBox
              key={job.id}
              removeLabel={`Remove job ${String(index + 1)}`}
              onRemove={() => {
                dispatch({ type: 'removeItem', section: 'experience', id: job.id });
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['title', 'Title'],
                    ['company', 'Company'],
                    ['location', 'Location'],
                    ['startDate', 'Start'],
                    ['endDate', 'End'],
                  ] as const
                ).map(([field, label]) => (
                  <TextField
                    key={field}
                    label={label}
                    value={job[field]}
                    onChange={(value) => {
                      dispatch({ type: 'setExperience', id: job.id, field, value });
                    }}
                  />
                ))}
              </div>
              <BulletList
                owner={owner}
                bullets={job.bullets}
                {...bulletHandlers('experience', job.id)}
              />
            </EntryBox>
          );
        })}
      </SectionCard>

      <SectionCard
        title="Projects"
        addLabel="Add project"
        onAdd={() => {
          dispatch({ type: 'addEntry', section: 'projects', id: newId('proj') });
        }}
      >
        {resume.projects.map((project, index) => {
          const owner = `Project ${String(index + 1)}`;
          return (
            <EntryBox
              key={project.id}
              removeLabel={`Remove project ${String(index + 1)}`}
              onRemove={() => {
                dispatch({ type: 'removeItem', section: 'projects', id: project.id });
              }}
            >
              <TextField
                label="Name"
                value={project.name}
                onChange={(name) => {
                  dispatch({ type: 'setProject', id: project.id, name });
                }}
              />
              <CommaListField
                key={project.tech.join('\n')}
                label="Tech"
                items={project.tech}
                onCommit={(tech) => {
                  dispatch({ type: 'setProject', id: project.id, tech });
                }}
              />
              <BulletList
                owner={owner}
                bullets={project.bullets}
                {...bulletHandlers('projects', project.id)}
              />
            </EntryBox>
          );
        })}
      </SectionCard>

      <SectionCard
        title="Education"
        addLabel="Add school"
        onAdd={() => {
          dispatch({ type: 'addEntry', section: 'education', id: newId('edu') });
        }}
      >
        {resume.education.map((entry, index) => (
          <EntryBox
            key={entry.id}
            removeLabel={`Remove school ${String(index + 1)}`}
            onRemove={() => {
              dispatch({ type: 'removeItem', section: 'education', id: entry.id });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['school', 'School'],
                  ['degree', 'Degree'],
                  ['location', 'Location'],
                  ['startYear', 'Start year'],
                  ['endYear', 'End year'],
                ] as const
              ).map(([field, label]) => (
                <TextField
                  key={field}
                  label={label}
                  value={entry[field]}
                  onChange={(value) => {
                    dispatch({ type: 'setEducation', id: entry.id, field, value });
                  }}
                />
              ))}
            </div>
          </EntryBox>
        ))}
      </SectionCard>
    </div>
  );
}
