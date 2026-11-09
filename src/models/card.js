/**
 * A frontend representation of a card document in a session's cards collection.
 * @typedef {Object} Card
 * @property {string} id Document ID supplied by the API, not the owner identity.
 * @property {string} question
 * @property {string} answer
 * @property {number} step Existing source step in the same session.
 * @property {boolean} known Rebuild resets this to false.
 */

/** @returns {Card} */
export function createCard({ id, question, answer, step, known = false }) {
  return { id, question, answer, step, known };
}
