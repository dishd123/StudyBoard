/**
 * One aligned note per board step; summary is stored separately on the session.
 * @typedef {Object} Note
 * @property {number} step Existing session.photo.steps[].step.
 * @property {string} boardText What was written on the board.
 * @property {string|null} explanation Null when no matching explanation exists.
 * @property {string|null} correction Explicit spoken correction, or null.
 */

/** @returns {Note} */
export function createNote({ step, boardText, explanation = null, correction = null }) {
  return { step, boardText, explanation, correction };
}
