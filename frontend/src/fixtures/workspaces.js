import { createSession, SESSION_STATUS } from '../models/session.js';
import { createPhoto, createAudio } from '../models/material.js';
import { createNote } from '../models/note.js';
import { createCard } from '../models/card.js';
import { createQuestion } from '../models/question.js';

export const fixtureNames = Object.freeze(['empty', 'draft', 'processing', 'ready', 'failed']);
const createdAt = '2026-11-08T18:00:00.000Z';
const updatedAt = '2026-11-08T18:05:00.000Z';

// Synthetic examples for frontend development, not extracted from the photo.
// The existing bundled image is a visual stand-in for every fixture thumbnail.
const topics = [
  {
    id: 'vision-demo', title: 'Edge Detection', course: 'Computer Vision',
    steps: ['Read the image.', 'Blur with sigma 1.4.', 'Compute image gradients.'],
    explanations: ['Start with the image to be analyzed.', 'Blurring reduces noise before differentiation.', 'Gradients measure changes in image intensity.'],
    correction: 'Use sigma 2 instead of 1.4.',
    cards: [
      ['Why blur before computing gradients?', 'Blurring reduces noise that differentiation would amplify.', 2],
      ['What does an image gradient measure?', 'Changes in image intensity.', 3],
      ['What is the first input to this process?', 'The image to be analyzed.', 1],
      ['Which sigma does the spoken correction specify?', 'Sigma 2, replacing the written value 1.4.', 2],
      ['Why does the blur come before the gradient step?', 'To reduce noise before measuring intensity changes.', 2]
    ]
  },
  {
    id: 'web-demo', title: 'HTTP and APIs', course: 'Web Systems',
    steps: ['Send an HTTP request.', 'Validate the request on the server.', 'Return a response with a status code.'],
    explanations: ['The client requests an operation on a resource.', 'Validation rejects invalid input before processing.', 'The status code communicates the outcome to the client.'],
    correction: null,
    cards: [
      ['Why validate an API request?', 'To reject invalid input before processing.', 2],
      ['What communicates the request outcome?', 'The HTTP response status code.', 3],
      ['Who initiates the request?', 'The client.', 1],
      ['When should the server validate input?', 'Before processing the operation.', 2],
      ['What does the server return after processing?', 'A response with a status code.', 3]
    ]
  },
  {
    id: 'ml-demo', title: 'Loss Functions', course: 'Machine Learning',
    steps: ['Make a prediction.', 'Compare it with the target using a loss.', 'Update model parameters.'],
    explanations: ['The current model produces a prediction.', 'The loss quantifies prediction error.', 'The update aims to reduce the loss.'],
    correction: null,
    cards: [
      ['Why compute a loss?', 'To quantify prediction error.', 2],
      ['What is compared with the prediction?', 'The target.', 2],
      ['What produces the initial prediction?', 'The current model.', 1],
      ['Why update model parameters?', 'To reduce the loss.', 3],
      ['What happens before the loss is computed?', 'The model makes a prediction.', 1]
    ]
  }
];

function createReadyWorkspace() {
  const cardsBySession = {};
  const questionsBySession = {};
  const sessions = topics.map((topic) => {
    const steps = topic.steps.map((text, index) => ({ step: index + 1, text }));
    const points = topic.explanations.map((text) => ({ text, kind: 'explanation' }));
    points.push({ text: 'Keep the order of these steps.', kind: 'emphasis' });
    if (topic.correction) points.push({ text: topic.correction, kind: 'correction' });

    const cards = topic.cards.map(([question, answer, step], index) => createCard({
      id: `${topic.id}-card-${index + 1}`, question, answer, step, known: index === 0
    }));
    cardsBySession[topic.id] = cards;
    questionsBySession[topic.id] = [
      createQuestion({
        id: `${topic.id}-question-1`, question: cards[0].question, answer: cards[0].answer,
        stepsUsed: [cards[0].step], covered: true, askedAt: '2026-11-08T18:06:00.000Z'
      }),
      createQuestion({
        id: `${topic.id}-question-2`, question: 'What will be on the final exam?',
        answer: 'The saved session material does not cover the final exam.',
        stepsUsed: [], covered: false, askedAt: '2026-11-08T18:07:00.000Z'
      })
    ];

    return createSession({
      id: topic.id, title: topic.title, course: topic.course,
      createdAt, updatedAt, status: SESSION_STATUS.READY,
      photo: createPhoto({
        title: topic.title, thumbnail: '/images/app-board.jpg', steps,
        unreadableParts: topic.id === 'vision-demo' ? ['Small diagram label is unreadable.'] : [],
        visionText: topic.steps.join('\n')
      }),
      audio: createAudio({
        transcript: points.map((point) => point.text).join(' '), points, length: 75
      }),
      summary: `This sample session covers ${topic.title.toLowerCase()}. The notes pair each board step with its spoken explanation.`,
      notes: steps.map(({ step, text }) => createNote({
        step, boardText: text, explanation: topic.explanations[step - 1],
        correction: step === 2 ? topic.correction : null
      })),
      cardCount: cards.length
    });
  });
  return { sessions, cardsBySession, questionsBySession, operation: { status: 'idle', name: null } };
}

/**
 * Return an independent workspace for each call. IDs are synthetic, dates fixed,
 * and every card/question belongs to a session through its containing map.
 * Factories describe shapes; backend input/schema validation is separate work.
 */
export function createWorkspaceFixture(name = 'ready') {
  if (!fixtureNames.includes(name)) throw new Error(`Unknown workspace fixture: ${name}`);
  if (name === 'empty') {
    return { sessions: [], cardsBySession: {}, questionsBySession: {}, operation: { status: 'idle', name: null } };
  }
  if (name === 'ready') return createReadyWorkspace();

  const source = createReadyWorkspace().sessions[0];
  const session = createSession({
    id: `${name}-demo`, title: source.title, course: source.course, createdAt,
    photo: name === 'draft' ? null : source.photo,
    audio: name === 'draft' ? null : source.audio,
    status: name === 'failed' ? SESSION_STATUS.FAILED : SESSION_STATUS.DRAFT,
    errorMessage: name === 'failed' ? 'The sample build failed. Your processed material is still available to retry.' : null
  });
  return {
    sessions: [session], cardsBySession: { [session.id]: [] }, questionsBySession: { [session.id]: [] },
    operation: { status: name === 'processing' ? 'processing' : 'idle', name: name === 'processing' ? 'build' : null }
  };
}
