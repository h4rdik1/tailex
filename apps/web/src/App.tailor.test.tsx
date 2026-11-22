import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAMPLE_JD, type KeywordsResponse } from '@tailex/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

/** What the server's /api/keywords would say about the sample resume and sample job description. */
const ANALYSIS: KeywordsResponse = {
  matched: ['React', 'TypeScript', 'Docker', 'CI/CD'],
  missing: [
    {
      skill: 'Terraform',
      category: 'Cloud & DevOps',
      required: true,
      suggestedGroup: { groupId: 'skills2', label: 'Tools' },
    },
    {
      skill: 'Kubernetes',
      category: 'Cloud & DevOps',
      required: false,
      suggestedGroup: { groupId: 'skills2', label: 'Tools' },
    },
  ],
  extra: ['SQL'],
  score: 67,
  jdSkillCount: 6,
};

interface Call {
  url: string;
  init: RequestInit | undefined;
}

let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  window.matchMedia = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/keywords') return Promise.resolve(Response.json(ANALYSIS));
      if (url === '/api/health') return Promise.resolve(Response.json({ status: 'ok' }));
      // Anything else (the PDF render) fails quietly: this test is about the Tailor step.
      return Promise.resolve(
        Response.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
      );
    }),
  );
});

async function openTailorWithSample(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));
  await user.click(screen.getByRole('button', { name: 'Preview PDF' }));
  await user.click(screen.getByRole('button', { name: 'Tailor to a job description' }));
}

describe('Tailor step in sample mode (no key, no AI call)', () => {
  it('opens with the sample job description already pasted', async () => {
    await openTailorWithSample(userEvent.setup());

    expect(screen.getByRole('heading', { level: 1, name: 'Tailor to a job' })).toHaveFocus();
    expect(screen.getByLabelText('Job description')).toHaveValue(SAMPLE_JD);
    expect(screen.getByRole('button', { name: /^4 Tailor/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('analyzes, adds a ticked skill, asks for rewrites and accepts one, with the key never involved', async () => {
    const user = userEvent.setup();
    await openTailorWithSample(user);

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByText('Skills the job asks for')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /Match score/ })).toHaveAttribute(
      'aria-valuenow',
      '67',
    );
    expect(screen.getByText('required')).toBeInTheDocument();

    // Nothing is added until the user ticks AND clicks.
    expect(screen.getByRole('button', { name: 'Add selected to Skills' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Terraform/ }));
    await user.click(screen.getByRole('button', { name: 'Add 1 selected to Skills' }));
    expect(screen.getByText(/Added to Skills: Terraform\./)).toBeInTheDocument();
    expect(screen.getByText(/Added so far:/)).toHaveTextContent('Terraform');

    await user.click(screen.getByRole('button', { name: 'Suggest bullet rewrites' }));
    const list = await screen.findByRole(
      'list',
      { name: 'Suggested rewrites' },
      { timeout: 3_000 },
    );

    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    expect(within(list).getAllByText('Blocked')).toHaveLength(2);
    expect(
      screen.getByText(/Adds a skill that is not in this bullet: TypeScript\./),
    ).toBeInTheDocument();
    expect(within(list).getAllByRole('button', { name: /^Accept rewrite/ })).toHaveLength(2);

    await user.click(within(list).getByRole('button', { name: 'Accept rewrite 2' }));
    await waitFor(() => {
      expect(within(list).getByText('Accepted')).toBeInTheDocument();
    });

    // The sample never used the key or the AI route.
    expect(calls.some((call) => call.url === '/api/tailor')).toBe(false);
    expect(JSON.stringify(calls.map((call) => call.init?.headers ?? {}))).not.toContain(
      'x-llm-key',
    );
  });

  it('offers the role box and a seniority checkbox that is ticked by default', async () => {
    const user = userEvent.setup();
    await openTailorWithSample(user);
    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    await screen.findByText('Skills the job asks for');

    const role = screen.getByLabelText(/Role you are aiming for/);
    expect(role).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /Keep my seniority/ })).toBeChecked();

    await user.type(role, 'Backend Engineer');
    await user.click(screen.getByRole('checkbox', { name: /Keep my seniority/ }));

    expect(role).toHaveValue('Backend Engineer');
    expect(screen.getByRole('checkbox', { name: /Keep my seniority/ })).not.toBeChecked();
  });

  it('asks for a job description first, and explains instead of failing', async () => {
    const user = userEvent.setup();
    await openTailorWithSample(user);
    await user.clear(screen.getByLabelText('Job description'));

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Paste a job description first.');
    expect(calls.some((call) => call.url === '/api/keywords')).toBe(false);
  });

  it('says so when the job description has no recognisable skills', async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (url === '/api/keywords') {
        return Promise.resolve(
          Response.json({ matched: [], missing: [], extra: [], score: 0, jdSkillCount: 0 }),
        );
      }
      return Promise.resolve(Response.json({ status: 'ok' }));
    });
    const user = userEvent.setup();
    await openTailorWithSample(user);

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByText(/did not recognise any skills/)).toBeInTheDocument();
  });

  it('shows a readable error when the server is unreachable', async () => {
    vi.mocked(fetch).mockImplementation((url) =>
      url === '/api/health'
        ? Promise.resolve(Response.json({ status: 'ok' }))
        : Promise.reject(new TypeError('offline')),
    );
    const user = userEvent.setup();
    await openTailorWithSample(user);

    await user.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled();
  });

  it('asks to analyze again when the job description is edited after the analysis', async () => {
    const user = userEvent.setup();
    await openTailorWithSample(user);
    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    await screen.findByText('Skills the job asks for');

    await user.type(screen.getByLabelText('Job description'), ' More text.');

    expect(screen.getByText(/You changed the job description/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest bullet rewrites' })).toBeDisabled();
  });

  it('loading a new resume clears the old analysis', async () => {
    const user = userEvent.setup();
    await openTailorWithSample(user);
    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    await screen.findByText('Skills the job asks for');

    await user.click(screen.getByRole('button', { name: /Upload/ }));
    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));
    await user.click(screen.getByRole('button', { name: 'Preview PDF' }));
    await user.click(screen.getByRole('button', { name: 'Tailor to a job description' }));

    expect(screen.queryByText('Skills the job asks for')).not.toBeInTheDocument();
  });
});
