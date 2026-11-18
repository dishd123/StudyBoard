// Sessions and flashcards API (issue #35), mounted at /api/sessions after requireUser.
// Each handler checks the request, calls sessionStore with the verified req.uid, and answers with JSON.
import express from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import {
  createSession,
  deleteCard,
  deleteSession,
  getSession,
  listCards,
  listSessions,
  updateCard,
  updateSession,
} from '../services/sessionStore.js';

const router = express.Router();
const maxTitleLength = 80; // characters
const maxCourseLength = 60; // characters
const defaultCourse = 'General'; // used when the course is left blank
const titleMessage = 'Give the session a title of 1 to 80 characters.';
const courseMessage = 'Keep the course name to 60 characters or fewer.';

/**
 * Checks a session title from the request body.
 * @param {unknown} value body.title
 * @returns {string} The title without surrounding spaces.
 * @throws {HttpError} 400 when it is not text of 1-80 characters.
 */
function readTitle(value) {
  if (typeof value !== 'string') {
    throw new HttpError(400, titleMessage);
  }
  const title = value.trim();
  if (title.length === 0 || title.length > maxTitleLength) {
    throw new HttpError(400, titleMessage);
  }
  return title;
}

/**
 * Checks a course name from the request body.
 * @param {unknown} value body.course; missing, null or blank becomes "General".
 * @returns {string} The course name without surrounding spaces.
 * @throws {HttpError} 400 when it is not text or is longer than 60 characters.
 */
function readCourse(value) {
  if (value === undefined || value === null) {
    return defaultCourse;
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, courseMessage);
  }
  const course = value.trim();
  if (course.length > maxCourseLength) {
    throw new HttpError(400, courseMessage);
  }
  if (course === '') {
    return defaultCourse;
  }
  return course;
}

// GET /api/sessions?course=<name> -> { sessions }, newest first.
router.get('/', async (req, res) => {
  // No ?course= (or a repeated one, which arrives as an array) lists every course.
  let course = '';
  if (typeof req.query.course === 'string') {
    course = req.query.course.trim();
  }
  const sessions = await listSessions(req.uid, course);
  res.json({ sessions });
});

// POST /api/sessions { title, course } -> { session } with status "draft".
router.post('/', async (req, res) => {
  const body = req.body || {}; // req.body is undefined when the request carried no JSON
  const title = readTitle(body.title);
  const course = readCourse(body.course);
  const session = await createSession(req.uid, { title, course });
  res.json({ session });
});

// GET /api/sessions/:sid -> { session, cards }.
router.get('/:sid', async (req, res) => {
  const session = await getSession(req.uid, req.params.sid);
  const cards = await listCards(req.uid, req.params.sid, { unknownOnly: false });
  res.json({ session, cards });
});

// PATCH /api/sessions/:sid { title?, course? } -> { session }.
router.patch('/:sid', async (req, res) => {
  const body = req.body || {};
  const changes = {};
  // Check and change only the fields the browser sent.
  if (body.title !== undefined) {
    changes.title = readTitle(body.title);
  }
  if (body.course !== undefined) {
    changes.course = readCourse(body.course);
  }
  if (changes.title === undefined && changes.course === undefined) {
    throw new HttpError(400, 'Send a new title or course.');
  }
  const session = await updateSession(req.uid, req.params.sid, changes);
  res.json({ session });
});

// DELETE /api/sessions/:sid -> { ok: true }; the session's cards and questions go with it.
router.delete('/:sid', async (req, res) => {
  await deleteSession(req.uid, req.params.sid);
  res.json({ ok: true });
});

// GET /api/sessions/:sid/cards?known=false -> { cards }; known=false returns only the cards not known yet.
router.get('/:sid/cards', async (req, res) => {
  const unknownOnly = req.query.known === 'false';
  const cards = await listCards(req.uid, req.params.sid, { unknownOnly });
  res.json({ cards });
});

// PATCH /api/sessions/:sid/cards/:cid { known } -> { card }.
router.patch('/:sid/cards/:cid', async (req, res) => {
  const body = req.body || {};
  if (typeof body.known !== 'boolean') {
    throw new HttpError(400, 'Send known as true or false.');
  }
  const card = await updateCard(req.uid, req.params.sid, req.params.cid, { known: body.known });
  res.json({ card });
});

// DELETE /api/sessions/:sid/cards/:cid -> { ok: true }.
router.delete('/:sid/cards/:cid', async (req, res) => {
  await deleteCard(req.uid, req.params.sid, req.params.cid);
  res.json({ ok: true });
});

export default router;