// Project 1 samples only. Issue #3 will define the revised models and fixtures.
export const demoSessions = [
  { id: 'vision-demo', title: 'Computer Vision · Edge Detection', date: 'Today', cards: 12, color: 'mint' },
  { id: 'web-demo', title: 'Web Systems · HTTP and APIs', date: 'Yesterday', cards: 8, color: 'peach' },
  { id: 'ml-demo', title: 'Machine Learning · Loss Functions', date: 'Sep 08', cards: 16, color: 'lavender' }
];

// This shared sample deck is not generated from the selected session.
export const demoCards = [
  { q: 'Why do we blur an image before edge detection?', a: 'Blurring reduces noise so the detector focuses on meaningful changes.' },
  { q: 'What does a gradient reveal?', a: 'It reveals how quickly pixel intensity changes across an image.' }
];
