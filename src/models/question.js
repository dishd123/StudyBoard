/**
 * Saved tutor history after the backend has parsed the tutor's plain-text answer.
 * @typedef {Object} Question
 * @property {string} id Question document ID supplied by the API.
 * @property {string} question Typed user question.
 * @property {string} answer
 * @property {number[]} stepsUsed Existing source steps; empty if uncovered.
 * @property {boolean} covered Whether saved material covers the question.
 * @property {string} askedAt ISO 8601 UTC time serialized by the API.
 */

/** @returns {Question} */
export function createQuestion({ id, question, answer, stepsUsed = [], covered, askedAt }) {
  return { id, question, answer, stepsUsed, covered, askedAt };
}
