// Short paraphrased reminders. Page numbers refer to The_Secret_Flower_[Rules].pdf.
import { SETUPS } from './game-data.js';

export function rulesSections() {
  const table = (diff) =>
    [2, 3, 4, 5].map((n) => ({ n, hidden: SETUPS[diff][n].hidden.join(' · '), question: SETUPS[diff][n].question.join(' · ') }));
  return [
    {
      title: 'Goal',
      body: ['Work together to identify the Secret Flower — the one card of the 16 set aside face-down at the start.'],
      src: 'p2',
    },
    {
      title: 'Setup',
      body: [
        'The other 15 cards are dealt as Hidden cards and Question cards. How many each seat gets depends on player count and difficulty (counts below start with the first player and go clockwise).',
      ],
      tables: [
        { caption: 'Simple', rows: table('simple') },
        { caption: 'Regular & Expert', rows: table('regular') },
      ],
      src: 'p3',
    },
    {
      title: 'Hidden cards',
      body: [
        'Each player sorts their Hidden cards from smallest to largest, left to right from their own point of view, and keeps them hidden.',
        'In this notebook, “Card 1 (lowest)” is always the owner’s leftmost card — even when you sit opposite them.',
      ],
      src: 'p4',
    },
    {
      title: 'Asking questions',
      body: ['A Question card may target any Hidden card — including your own and cards that have already been asked about.'],
      src: 'p5',
    },
    {
      title: 'Talking at the table',
      body: [
        'Never reveal what your own Hidden cards are. Public information may be discussed.',
        'If you think you have deduced a card, consult the other players before revealing it.',
      ],
      src: 'p6',
    },
    {
      title: 'Final guess & winning',
      body: [
        'Everyone names the Secret Flower simultaneously.',
        'Simple / Regular: at least 2 players must be correct (3 with five players).',
        'Expert: every player must be correct.',
      ],
      src: 'p7',
    },
  ];
}
