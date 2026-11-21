import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

beforeEach(() => {
  // jsdom has no matchMedia; the theme and the preview layout use it.
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
    vi.fn(() => Promise.resolve(new Response('{"status":"ok"}', { status: 200 }))),
  );
});

describe('App', () => {
  it('sample mode goes to Review with the fictional resume and no AI call', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /try with a sample resume/i }));

    expect(screen.getByRole('heading', { level: 1, name: 'Review and edit' })).toHaveFocus();
    expect(screen.getAllByLabelText('Name')[0]).toHaveValue('Asha Testwala');
    expect(screen.getByText(/sample mode made no ai call/i)).toBeInTheDocument();
    // Only the health check ran: no parse request, so no key was ever needed.
    expect(vi.mocked(fetch).mock.calls.every(([url]) => url === '/api/health')).toBe(true);
  });

  it('shows "No key" until a key is typed, then "In memory"', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('No key')).toBeInTheDocument();
    await user.type(screen.getByLabelText('API key'), 'AIza-fake-test-key-000');

    expect(screen.getByText('In memory')).toBeInTheDocument();
    expect(localStorage.length).toBe(0); // remember is off: nothing saved
  });
});
