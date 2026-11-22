import type { LlmParsedResume } from '@tailex/shared';
import type { GenerateJsonInput, LlmProvider } from './types.ts';

/**
 * A provider that never touches the network. Used by tests and (from Phase 4) sample mode.
 * Each call returns the next scripted answer; the last answer repeats.
 * `calls` records the inputs (WITHOUT the key) so tests can check what would have been sent.
 */
export interface MockProvider extends LlmProvider {
  readonly calls: Omit<GenerateJsonInput, 'apiKey'>[];
}

/** Any JSON-like value to return, or an Error to throw. */
export type MockAnswer = unknown;

export function createMockProvider(answers: readonly MockAnswer[] = [SAMPLE_PARSED]): MockProvider {
  const calls: Omit<GenerateJsonInput, 'apiKey'>[] = [];

  return {
    name: 'mock',
    calls,
    generateJson({ apiKey: _apiKey, ...rest }) {
      calls.push(rest);
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    checkKey() {
      return Promise.resolve();
    },
  };
}

/** What a good parse of the fictional "fresher" resume looks like (LLM shape: no ids, no contact). */
export const SAMPLE_PARSED: LlmParsedResume = {
  headline: '',
  summary: '',
  skills: [{ category: 'Languages', items: ['TypeScript', 'JavaScript', 'SQL'] }],
  experience: [],
  projects: [
    {
      name: 'Budget Buddy',
      tech: ['React', 'Express', 'SQLite'],
      bullets: ['Personal finance tracker with monthly charts and CSV import for 3 bank formats.'],
    },
  ],
  education: [
    {
      school: 'Example Institute of Technology',
      degree: 'B.Tech Computer Engineering',
      location: '',
      startYear: '2019',
      endYear: '2023',
    },
  ],
};
