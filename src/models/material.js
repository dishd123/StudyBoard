/**
 * Processed results only: a session has one Photo|null and one Audio|null.
 * Raw media and OAuth tokens are never part of these saved data shapes.
 * @typedef {{ step: number, text: string }} BoardStep
 * @typedef {{ text: string, kind: 'explanation'|'correction'|'emphasis' }} AudioPoint
 * @typedef {Object} Photo
 * @property {string} title
 * @property {string} thumbnail Serialized thumbnail suitable for an img src.
 * @property {BoardStep[]} steps Ordered, unique positive step numbers.
 * @property {string[]} unreadableParts Content that could not be read reliably.
 * @property {string} visionText Fallible OCR hint; not authoritative notes.
 * @typedef {Object} Audio
 * @property {string} transcript
 * @property {AudioPoint[]} points
 * @property {number} length Duration in seconds, at most 180.
 */

/** @returns {Photo} */
export function createPhoto({ title, thumbnail, steps = [], unreadableParts = [], visionText = '' }) {
  return { title, thumbnail, steps, unreadableParts, visionText };
}

/** @returns {Audio} */
export function createAudio({ transcript, points = [], length }) {
  return { transcript, points, length };
}
