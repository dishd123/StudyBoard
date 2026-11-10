/** Exact fixture lookup only, not retrieval, inference, or an AI tutor. */
export function createTutorPreview(question, examples = [], sourceSteps = []) {
  const normalize = (text) => typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').toLowerCase() : '';
  const example = examples.find((item) => normalize(item.question) === normalize(question));
  const available = new Set(sourceSteps);
  const valid = example && typeof example.answer === 'string' && Array.isArray(example.stepsUsed)
    && (example.covered === true
      ? example.stepsUsed.length > 0 && example.stepsUsed.every((step) => available.has(step))
      : example.covered === false && example.stepsUsed.length === 0);
  if (!valid) {
    return {
      kind: 'no-match', covered: null, stepsUsed: [],
      answer: 'No matching fixture answer is available for this question. The real tutor is not connected, so this preview cannot determine whether your notes cover it.'
    };
  }
  return { kind: 'fixture', answer: example.answer, covered: example.covered, stepsUsed: [...example.stepsUsed] };
}
