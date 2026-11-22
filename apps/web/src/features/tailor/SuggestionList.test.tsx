import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TailorSuggestion } from '@tailex/shared';
import { describe, expect, it, vi } from 'vitest';
import { SuggestionList } from './SuggestionList.tsx';
import type { SuggestionStatus, SuggestionView } from './useTailor.ts';

const suggestion = (id: string, overrides: Partial<TailorSuggestion> = {}): TailorSuggestion => ({
  id,
  original: 'Built a React dashboard for support agents.',
  suggested: 'Developed a React dashboard for support agents.',
  reason: 'Uses the job description wording.',
  status: 'ok',
  ...overrides,
});

const view = (
  s: TailorSuggestion,
  decision: SuggestionView['decision'] = 'pending',
): SuggestionView => ({
  suggestion: s,
  decision,
});

function renderList(views: SuggestionView[], statuses: Record<string, SuggestionStatus> = {}) {
  const handlers = { onAccept: vi.fn(), onReject: vi.fn(), onAcceptAll: vi.fn() };
  render(
    <SuggestionList
      views={views}
      meta={{ bulletsConsidered: 6, bulletsTotal: 6, ignored: 0 }}
      statusOf={(v) =>
        statuses[v.suggestion.id] ?? (v.suggestion.status === 'blocked' ? 'blocked' : 'ok')
      }
      {...handlers}
    />,
  );
  return handlers;
}

describe('SuggestionList', () => {
  it('shows the changes word by word, with removed and added words marked', () => {
    renderList([view(suggestion('b1'))]);

    const card = screen.getByRole('listitem');
    expect(card.querySelector('del')?.textContent).toBe('Built');
    expect(card.querySelector('ins')?.textContent).toBe('Developed');
    expect(screen.getByText('Uses the job description wording.')).toBeInTheDocument();
  });

  it('accepts and rejects through buttons named for the rewrite', async () => {
    const user = userEvent.setup();
    const handlers = renderList([view(suggestion('b1')), view(suggestion('b2'))]);

    await user.click(screen.getByRole('button', { name: 'Accept rewrite 2' }));
    await user.click(screen.getByRole('button', { name: 'Reject rewrite 1' }));

    expect(handlers.onAccept).toHaveBeenCalledWith('b2');
    expect(handlers.onReject).toHaveBeenCalledWith('b1');
  });

  it('a blocked rewrite shows its reason and has NO accept button', () => {
    renderList([
      view(suggestion('b1', { status: 'blocked', blockedReason: 'Adds a skill: Docker.' })),
    ]);

    expect(screen.getByText(/Not accepted: Adds a skill: Docker\./)).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept rewrite/ })).not.toBeInTheDocument();
  });

  it('a blocked rewrite without a reason still says why in plain words', () => {
    renderList([view(suggestion('b1', { status: 'blocked' }))]);

    expect(screen.getByText(/did not pass the truth check/)).toBeInTheDocument();
  });

  it('an outdated rewrite explains itself and cannot be accepted', () => {
    renderList([view(suggestion('b1'))], { b1: 'outdated' });

    expect(screen.getByText(/edited or deleted this bullet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept rewrite/ })).not.toBeInTheDocument();
  });

  it('accepted and rejected ones show their state and no buttons', () => {
    renderList([view(suggestion('b1'), 'accepted'), view(suggestion('b2'), 'rejected')], {
      b1: 'accepted',
      b2: 'rejected',
    });

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rewrite/ })).not.toBeInTheDocument();
  });

  it('counts the suggestions and offers Accept all only for the ones that passed', async () => {
    const user = userEvent.setup();
    const handlers = renderList([
      view(suggestion('b1')),
      view(suggestion('b2', { status: 'blocked', blockedReason: 'Adds a number.' })),
      view(suggestion('b3')),
    ]);

    expect(screen.getByRole('status')).toHaveTextContent(
      '3 suggestions: 2 ready to accept, 1 blocked.',
    );
    await user.click(screen.getByRole('button', { name: 'Accept all 2 that passed' }));
    expect(handlers.onAcceptAll).toHaveBeenCalledOnce();
  });

  it('disables Accept all when nothing passed', () => {
    renderList([view(suggestion('b1', { status: 'blocked', blockedReason: 'x' }))]);

    expect(screen.getByRole('button', { name: 'Accept all' })).toBeDisabled();
  });

  it('says when the AI had nothing to suggest, and says nothing before it was asked', () => {
    const { unmount } = render(
      <SuggestionList
        views={[]}
        meta={{ bulletsConsidered: 6, bulletsTotal: 6, ignored: 0 }}
        statusOf={() => 'ok'}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onAcceptAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/nothing worth rewording/)).toBeInTheDocument();
    unmount();

    render(
      <SuggestionList
        views={[]}
        meta={null}
        statusOf={() => 'ok'}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onAcceptAll={vi.fn()}
      />,
    );
    expect(screen.queryByText(/nothing worth rewording/)).not.toBeInTheDocument();
  });

  it('tells the user when only some bullets were checked', () => {
    render(
      <SuggestionList
        views={[view(suggestion('b1'))]}
        meta={{ bulletsConsidered: 40, bulletsTotal: 62, ignored: 0 }}
        statusOf={() => 'ok'}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onAcceptAll={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Only the first 40 of your 62 bullets were checked.'),
    ).toBeInTheDocument();
  });

  it('shows AI text as plain text, never as HTML', () => {
    const evil = '<img src=x onerror="alert(1)"> <b>bold</b> <script>alert(1)</script>';
    renderList([view(suggestion('b1', { suggested: evil, reason: '<i>reason</i>' }))]);

    const card = screen.getByRole('listitem');
    expect(card.querySelector('img, script, b, i')).toBeNull();
    // The tags appear as literal characters (the diff interleaves kept words, so check each piece).
    const shown = card.textContent;
    for (const literal of [
      '<img',
      'onerror="alert(1)">',
      '<b>bold</b>',
      '<script>alert(1)</script>',
      '<i>reason</i>',
    ]) {
      expect(shown).toContain(literal);
    }
  });
});
