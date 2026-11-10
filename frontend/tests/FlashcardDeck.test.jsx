import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FlashcardDeck from '../../src/components/FlashcardDeck.jsx';
import { createWorkspaceFixture } from '../../src/fixtures/workspaces.js';
import { button, click, setupUi } from './helpers/ui.jsx';

const ui = setupUi();
const fixture = () => {
  const data = createWorkspaceFixture('ready');
  return data.cardsBySession[data.sessions[0].id];
};

function ReviewHarness({ initial = fixture() }) {
  const [cards, setCards] = useState(initial);
  return <FlashcardDeck cards={cards}
    onMarkKnown={(id, known) => setCards(current => current.map(card => card.id === id ? { ...card, known } : card))}
    onDeleteCard={id => setCards(current => current.filter(card => card.id !== id))} />;
}

describe('flashcard review', () => {
  it('flips to the answer with a source step, navigates, and resets the flip', async () => {
    const cards = fixture();
    const { container } = await ui.mount(<ReviewHarness initial={cards} />);
    const flip = container.querySelector('.flashcard');
    expect(flip.tagName).toBe('BUTTON');
    await click(flip);
    expect(flip.getAttribute('aria-pressed')).toBe('true');
    expect(flip.textContent).toContain(cards[0].answer);
    expect(flip.textContent).toContain(`Source: step ${cards[0].step}`);
    await click(button(container, /Next card/));
    expect(container.querySelector('.flashcard').textContent).toContain(cards[1].question);
    expect(container.querySelector('.flashcard').getAttribute('aria-pressed')).toBe('false');
    await click(button(container, /Previous/));
    expect(container.querySelector('.flashcard').textContent).toContain(cards[0].question);
  });

  it('shows an honest empty deck and disables navigation for one card', async () => {
    const view = await ui.mount(<FlashcardDeck cards={[]} onMarkKnown={vi.fn()} onDeleteCard={vi.fn()} />);
    expect(view.container.textContent).toContain('No sample cards to display.');
    expect(view.container.querySelector('.flashcard')).toBeNull();
    await view.render(<FlashcardDeck cards={fixture().slice(0, 1)} onMarkKnown={vi.fn()} onDeleteCard={vi.fn()} />);
    expect(button(view.container, /Previous/).disabled).toBe(true);
    expect(button(view.container, /Next card/).disabled).toBe(true);
  });

  it('filters unknown cards, handles marking the last one known, then restores all cards', async () => {
    const cards = fixture().slice(0, 1).map(card => ({ ...card, known: false }));
    const { container } = await ui.mount(<ReviewHarness initial={cards} />);
    await click(container.querySelector('input[type="checkbox"]'));
    await click(button(container, 'Got it'));
    expect(container.textContent).toContain('All cards are marked Got it.');
    expect(document.activeElement).toBe(container.querySelector('input[type="checkbox"]'));
    await click(container.querySelector('input[type="checkbox"]'));
    expect(button(container, 'Got it').getAttribute('aria-pressed')).toBe('true');
    await click(button(container, 'Still learning'));
    expect(container.querySelector('.deck-summary').textContent).toContain('0 Got it');
  });

  it('requires deletion confirmation and restores focus after cancel or final deletion', async () => {
    const { container } = await ui.mount(<ReviewHarness initial={fixture().slice(0, 1)} />);
    await click(button(container, 'Delete card'));
    expect(document.activeElement).toBe(button(container, 'Cancel'));
    await click(button(container, 'Cancel'));
    expect(container.querySelector('.flashcard')).not.toBeNull();
    expect(document.activeElement).toBe(button(container, 'Delete card'));
    await click(button(container, 'Delete card'));
    await click(button(container, 'Delete this card'));
    expect(container.querySelector('.flashcard')).toBeNull();
    expect(container.textContent).toContain('0 total');
    expect(document.activeElement).toBe(container.querySelector('input[type="checkbox"]'));
  });
});
