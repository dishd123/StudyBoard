// Every Firestore read and write for StudyBoard (issue #34), always under users/{uid} for the verified user.
// Returns plain objects: Timestamps become ISO strings, image Bytes become data URLs, pickerSessionId stays here.
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { logCall } from './logCall.js';
import { HttpError } from '../middleware/errorHandler.js';

const idPattern = /^[A-Za-z0-9_-]{1,64}$/; // letters, digits, "_" and "-" only: no "/" can reach a path
const sessionMissingMessage = 'We could not find that session.';
const cardMissingMessage = 'We could not find that card.';
// The fields a SessionSummary needs; the list reads only these and skips the large thumbnail.
const summaryFields = [
  'title',
  'course',
  'status',
  'cardCount',
  'photo.icon',
  'photo.iconType',
  'createdAt',
  'updatedAt',
];
const recentQuestionCount = 20; // the tutor history shows the last 20 questions
const notFoundCode = 5; // the gRPC code NOT_FOUND, which Firestore sends when a write meets a missing document

// Paths: the only place in the backend where Firestore paths are built.

/**
 * Rejects an id that could change the path, such as "a/b" from a decoded %2F in the URL.
 * @param {string} id A session or card id from the URL.
 * @throws {HttpError} 400 when the id is not 1-64 letters, digits, "_" or "-".
 */
function checkId(id) {
  if (typeof id !== 'string' || !idPattern.test(id)) {
    throw new HttpError(400, 'That link is not valid.');
  }
}

/**
 * The user's sessions collection. uid always comes from the verified token (req.uid), never from the request.
 * @param {string} uid Verified Firebase user id.
 * @returns {import('firebase-admin/firestore').CollectionReference} users/{uid}/sessions
 */
function sessionsCollection(uid) {
  return db.collection('users').doc(uid).collection('sessions');
}

/**
 * One session document. Each store function builds its references first, so a bad id fails before any Firestore call.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @returns {import('firebase-admin/firestore').DocumentReference} users/{uid}/sessions/{sessionId}
 * @throws {HttpError} 400 for an invalid id.
 */
function sessionRef(uid, sessionId) {
  checkId(sessionId);
  return sessionsCollection(uid).doc(sessionId);
}

/**
 * The cards of one session.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @returns {import('firebase-admin/firestore').CollectionReference} users/{uid}/sessions/{sessionId}/cards
 */
function cardsCollection(uid, sessionId) {
  return sessionRef(uid, sessionId).collection('cards');
}

/**
 * One card document.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @param {string} cardId Card id from the URL.
 * @returns {import('firebase-admin/firestore').DocumentReference} users/{uid}/sessions/{sessionId}/cards/{cardId}
 * @throws {HttpError} 400 for an invalid id.
 */
function cardRef(uid, sessionId, cardId) {
  checkId(cardId);
  return cardsCollection(uid, sessionId).doc(cardId);
}

/**
 * The tutor questions of one session.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @returns {import('firebase-admin/firestore').CollectionReference} users/{uid}/sessions/{sessionId}/questions
 */
function questionsCollection(uid, sessionId) {
  return sessionRef(uid, sessionId).collection('questions');
}

// Conversions from Firestore documents to the API shapes.

/**
 * @param {import('firebase-admin/firestore').Timestamp|null|undefined} timestamp A stored time.
 * @returns {string|null} ISO 8601 text, or null when the time is not set.
 */
function toIsoString(timestamp) {
  if (!timestamp) {
    return null;
  }
  return timestamp.toDate().toISOString();
}

/**
 * @param {Buffer|Uint8Array|null|undefined} bytes Image bytes stored as Firestore Bytes.
 * @param {string|null|undefined} mimeType The image type saved next to the bytes, such as image/jpeg.
 * @returns {string|null} A data URL the browser can use as an img src, or null when there is no image.
 */
function toDataUrl(bytes, mimeType) {
  if (!bytes || !mimeType) {
    return null;
  }
  // Firestore returns Bytes as a Buffer; Buffer.from also accepts a Uint8Array.
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

/**
 * @param {string} id Session document id.
 * @param {object} data Session fields (all of them, or only summaryFields).
 * @returns {object} SessionSummary: { id, title, course, status, cardCount, icon, createdAt, updatedAt }.
 */
function toSessionSummary(id, data) {
  return {
    id,
    title: data.title,
    course: data.course,
    status: data.status,
    cardCount: data.cardCount,
    // photo is null until a photo is imported, so read its fields with ?.
    icon: toDataUrl(data.photo?.icon, data.photo?.iconType),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

/**
 * @param {object|null} photo The stored photo map.
 * @returns {object|null} { thumbnail, title, steps, unreadable, importedAt }, or null before a photo is imported.
 */
function toPhoto(photo) {
  if (!photo) {
    return null;
  }
  return {
    thumbnail: toDataUrl(photo.thumbnail, photo.thumbnailType),
    title: photo.title,
    steps: photo.steps,
    unreadable: photo.unreadable,
    importedAt: toIsoString(photo.importedAt),
  };
}

/**
 * @param {object|null} audio The stored audio map.
 * @returns {object|null} { transcript, points, durationSeconds, recordedAt }, or null before a recording is saved.
 */
function toAudio(audio) {
  if (!audio) {
    return null;
  }
  return {
    transcript: audio.transcript,
    points: audio.points,
    durationSeconds: audio.durationSeconds,
    recordedAt: toIsoString(audio.recordedAt),
  };
}

/**
 * Lists the returned fields one by one, so pickerSessionId and raw Bytes never reach the browser.
 * @param {import('firebase-admin/firestore').DocumentSnapshot} snapshot A session document that exists.
 * @returns {object} Session: SessionSummary plus errorMessage, needsRebuild, photo, audio, summary, notes, builtAt.
 */
function toSession(snapshot) {
  const data = snapshot.data();
  return {
    ...toSessionSummary(snapshot.id, data),
    errorMessage: data.errorMessage,
    needsRebuild: data.needsRebuild,
    photo: toPhoto(data.photo),
    audio: toAudio(data.audio),
    summary: data.summary,
    notes: data.notes,
    builtAt: toIsoString(data.builtAt),
  };
}

/**
 * @param {import('firebase-admin/firestore').DocumentSnapshot} snapshot A card document that exists.
 * @returns {object} Card: { id, question, answer, stepNumber, known, createdAt }.
 */
function toCard(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    question: data.question,
    answer: data.answer,
    stepNumber: data.stepNumber,
    known: data.known,
    createdAt: toIsoString(data.createdAt),
  };
}

/**
 * @param {import('firebase-admin/firestore').DocumentSnapshot} snapshot A question document that exists.
 * @returns {object} Question: { id, question, answer, stepsUsed, covered, askedAt }.
 */
function toQuestion(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    question: data.question,
    answer: data.answer,
    stepsUsed: data.stepsUsed,
    covered: data.covered,
    askedAt: toIsoString(data.askedAt),
  };
}

// Steps shared by more than one store function.

/**
 * Reads one document and stops with 404 when it does not exist under this user.
 * @param {import('firebase-admin/firestore').DocumentReference} docRef The document to read.
 * @param {string} notFoundMessage The 404 message.
 * @returns {Promise<import('firebase-admin/firestore').DocumentSnapshot>} The snapshot of a document that exists.
 * @throws {HttpError} 404 when the document is missing.
 */
async function readExisting(docRef, notFoundMessage) {
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new HttpError(404, notFoundMessage);
  }
  return snapshot;
}

/**
 * Waits for a write to a document that readExisting found. A second request can delete that document
 * between the read and the write, for example two Delete clicks in two tabs; the write then fails.
 * @param {Promise<unknown>} write The started write, for example batch.commit().
 * @param {string} notFoundMessage The 404 message.
 * @returns {Promise<void>}
 * @throws {HttpError} 404 when the document was deleted meanwhile; any other Firestore error unchanged.
 */
async function writeExisting(write, notFoundMessage) {
  try {
    await write;
  } catch (error) {
    if (error.code === notFoundCode) {
      throw new HttpError(404, notFoundMessage);
    }
    throw error;
  }
}

/**
 * @param {object} data Session fields.
 * @returns {boolean} True when the session has notes from an earlier build.
 */
function hasNotes(data) {
  return Array.isArray(data.notes) && data.notes.length > 0;
}

/**
 * Reads a session's cards, sorted by board step.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id.
 * @param {boolean} unknownOnly True to return only cards not marked known yet.
 * @returns {Promise<object[]>} Card objects.
 */
async function readCards(uid, sessionId, unknownOnly) {
  let query = cardsCollection(uid, sessionId);
  if (unknownOnly) {
    query = query.where('known', '==', false);
  }
  const snapshot = await query.get();
  const cards = snapshot.docs.map((doc) => toCard(doc));
  // Sorting here, not with orderBy('stepNumber'), means the known filter needs no composite index.
  cards.sort((first, second) => first.stepNumber - second.stepNumber);
  return cards;
}

// The store functions the routes, services and agent tools call.

/**
 * Lists the user's sessions, newest first.
 * @param {string} uid Verified Firebase user id.
 * @param {string} [course] Only sessions in this course; '' or undefined lists every course.
 * @returns {Promise<object[]>} SessionSummary objects.
 */
export async function listSessions(uid, course) {
  return logCall({ operation: 'firestore.listSessions', uid }, async () => {
    let query = sessionsCollection(uid);
    // course == X sorted by createdAt uses the composite index in firestore.indexes.json.
    if (course) {
      query = query.where('course', '==', course);
    }
    // select() downloads only the summary fields, never the thumbnails.
    const snapshot = await query.orderBy('createdAt', 'desc').select(...summaryFields).get();
    return snapshot.docs.map((doc) => toSessionSummary(doc.id, doc.data()));
  });
}

/**
 * Creates an empty draft session.
 * @param {string} uid Verified Firebase user id.
 * @param {{ title: string, course: string }} fields Values the route has already checked.
 * @returns {Promise<object>} The new Session.
 */
export async function createSession(uid, { title, course }) {
  const sessionDoc = sessionsCollection(uid).doc(); // a new document with a random 20-character id
  return logCall({ operation: 'firestore.createSession', uid, sessionId: sessionDoc.id }, async () => {
    // Every field gets a starting value, so later reads never meet a missing field.
    await sessionDoc.set({
      title,
      course,
      status: 'draft',
      errorMessage: null,
      needsRebuild: false,
      photo: null,
      audio: null,
      summary: null,
      notes: null,
      cardCount: 0,
      builtAt: null,
      pickerSessionId: null,
      // serverTimestamp() uses Google's clock, not the browser's or this server's.
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const snapshot = await sessionDoc.get();
    return toSession(snapshot);
  });
}

/**
 * Reads one session.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @returns {Promise<object>} The Session.
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function getSession(uid, sessionId) {
  const sessionDoc = sessionRef(uid, sessionId);
  return logCall({ operation: 'firestore.getSession', uid, sessionId }, async () => {
    const snapshot = await readExisting(sessionDoc, sessionMissingMessage);
    return toSession(snapshot);
  });
}

/**
 * Renames a session or moves it to another course; only the fields given change.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @param {{ title?: string, course?: string }} fields Values the route has already checked.
 * @returns {Promise<object>} The updated Session.
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function updateSession(uid, sessionId, { title, course }) {
  const sessionDoc = sessionRef(uid, sessionId);
  return logCall({ operation: 'firestore.updateSession', uid, sessionId }, async () => {
    await readExisting(sessionDoc, sessionMissingMessage);
    const changes = { updatedAt: FieldValue.serverTimestamp() };
    if (title !== undefined) {
      changes.title = title;
    }
    if (course !== undefined) {
      changes.course = course;
    }
    await sessionDoc.update(changes);
    const snapshot = await sessionDoc.get();
    return toSession(snapshot);
  });
}

/**
 * Deletes a session with its cards and questions.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @returns {Promise<void>}
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function deleteSession(uid, sessionId) {
  const sessionDoc = sessionRef(uid, sessionId);
  await logCall({ operation: 'firestore.deleteSession', uid, sessionId }, async () => {
    await readExisting(sessionDoc, sessionMissingMessage);
    // Deleting a document leaves its subcollections behind; recursiveDelete removes the cards and questions too.
    await db.recursiveDelete(sessionDoc);
  });
}

/**
 * Lists a session's flashcards, sorted by board step.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @param {{ unknownOnly: boolean }} options unknownOnly true returns only cards not marked known.
 * @returns {Promise<object[]>} Card objects.
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function listCards(uid, sessionId, { unknownOnly }) {
  const sessionDoc = sessionRef(uid, sessionId);
  return logCall({ operation: 'firestore.listCards', uid, sessionId }, async () => {
    await readExisting(sessionDoc, sessionMissingMessage);
    return readCards(uid, sessionId, unknownOnly);
  });
}

/**
 * Marks a flashcard as known or not known.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @param {string} cardId Card id from the URL.
 * @param {{ known: boolean }} fields The new state.
 * @returns {Promise<object>} The updated Card.
 * @throws {HttpError} 400 for an invalid id, 404 when the card is missing.
 */
export async function updateCard(uid, sessionId, cardId, { known }) {
  const cardDoc = cardRef(uid, sessionId, cardId);
  return logCall({ operation: 'firestore.updateCard', uid, sessionId }, async () => {
    const snapshot = await readExisting(cardDoc, cardMissingMessage);
    await writeExisting(cardDoc.update({ known }), cardMissingMessage);
    // The snapshot was read before the update, so it still holds the old value of known.
    return { ...toCard(snapshot), known };
  });
}

/**
 * Deletes one flashcard and lowers the session's cardCount by one.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @param {string} cardId Card id from the URL.
 * @returns {Promise<void>}
 * @throws {HttpError} 400 for an invalid id, 404 when the card is missing.
 */
export async function deleteCard(uid, sessionId, cardId) {
  const cardDoc = cardRef(uid, sessionId, cardId);
  const sessionDoc = sessionRef(uid, sessionId);
  await logCall({ operation: 'firestore.deleteCard', uid, sessionId }, async () => {
    await readExisting(cardDoc, cardMissingMessage);
    // One batch: the card and the count change together, or neither changes.
    const batch = db.batch();
    // exists: true fails the whole batch if a second click already deleted the card, so the count stays right.
    batch.delete(cardDoc, { exists: true });
    batch.update(sessionDoc, { cardCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
    await writeExisting(batch.commit(), cardMissingMessage);
  });
}

/**
 * Stores the Google Photos Picker session id that the server created, for the later import step.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @param {string} pickerSessionId The id Google returned; it is never sent to the browser.
 * @returns {Promise<void>}
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function savePickerSession(uid, sessionId, pickerSessionId) {
  const sessionDoc = sessionRef(uid, sessionId);
  await logCall({ operation: 'firestore.savePickerSession', uid, sessionId }, async () => {
    await readExisting(sessionDoc, sessionMissingMessage);
    await sessionDoc.update({ pickerSessionId });
  });
}

/**
 * Reads back the Picker session id saved by savePickerSession.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @returns {Promise<string|null>} The Picker session id, or null when none is waiting.
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function getPickerSessionId(uid, sessionId) {
  const sessionDoc = sessionRef(uid, sessionId);
  return logCall({ operation: 'firestore.getPickerSessionId', uid, sessionId }, async () => {
    const snapshot = await readExisting(sessionDoc, sessionMissingMessage);
    return snapshot.data().pickerSessionId || null;
  });
}

/**
 * Saves what Gemini read from the board photo, replacing any earlier photo.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @param {object} photo { thumbnail: Buffer|null, thumbnailType: string|null, icon: Buffer|null, iconType: string|null,
 *   title: string, steps: { number, text }[], unreadable: string[] }; use null, never undefined, for a missing image.
 * @returns {Promise<object>} The updated Session (status draft; needsRebuild true when notes already exist).
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function savePhotoResult(
  uid,
  sessionId,
  { thumbnail, thumbnailType, icon, iconType, title, steps, unreadable },
) {
  const sessionDoc = sessionRef(uid, sessionId);
  return logCall({ operation: 'firestore.savePhotoResult', uid, sessionId }, async () => {
    const before = await readExisting(sessionDoc, sessionMissingMessage);
    await sessionDoc.update({
      photo: {
        thumbnail,
        thumbnailType,
        icon,
        iconType,
        title,
        steps,
        unreadable,
        importedAt: FieldValue.serverTimestamp(),
      },
      pickerSessionId: null, // this Picker session is used up
      status: 'draft',
      errorMessage: null,
      // Notes built from the old photo are now out of date.
      needsRebuild: hasNotes(before.data()),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const after = await sessionDoc.get();
    return toSession(after);
  });
}

/**
 * Saves what Gemini heard in the recording, replacing any earlier recording. The audio bytes are never stored.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @param {{ transcript: string, points: { kind, text }[], durationSeconds: number }} audio Checked values.
 * @returns {Promise<object>} The updated Session (status draft; needsRebuild true when notes already exist).
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function saveAudioResult(uid, sessionId, { transcript, points, durationSeconds }) {
  const sessionDoc = sessionRef(uid, sessionId);
  return logCall({ operation: 'firestore.saveAudioResult', uid, sessionId }, async () => {
    const before = await readExisting(sessionDoc, sessionMissingMessage);
    await sessionDoc.update({
      audio: { transcript, points, durationSeconds, recordedAt: FieldValue.serverTimestamp() },
      status: 'draft',
      errorMessage: null,
      // Notes built from the old recording are now out of date.
      needsRebuild: hasNotes(before.data()),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const after = await sessionDoc.get();
    return toSession(after);
  });
}

/**
 * Collects everything the tutor may answer from: the board steps, the recording, the notes and the cards.
 * @param {string} uid Verified Firebase user id, from the tool's request context.
 * @param {string} sessionId Session id, from the tool's request context.
 * @returns {Promise<object>} { title, course, steps, unreadable, transcript, points, summary, notes,
 *   cards: { question, answer, stepNumber }[] }
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function getTutorMaterial(uid, sessionId) {
  const sessionDoc = sessionRef(uid, sessionId);
  return logCall({ operation: 'firestore.getTutorMaterial', uid, sessionId }, async () => {
    const snapshot = await readExisting(sessionDoc, sessionMissingMessage);
    const data = snapshot.data();
    const cards = await readCards(uid, sessionId, false);
    // photo and audio stay null until they are added; ?. and ?? then give empty values instead.
    return {
      title: data.title,
      course: data.course,
      steps: data.photo?.steps ?? [],
      unreadable: data.photo?.unreadable ?? [],
      transcript: data.audio?.transcript ?? '',
      points: data.audio?.points ?? [],
      summary: data.summary,
      notes: data.notes ?? [],
      // The tutor needs the card text and step only, not ids or review state.
      cards: cards.map((card) => ({ question: card.question, answer: card.answer, stepNumber: card.stepNumber })),
    };
  });
}

/**
 * Saves a finished build: replaces the cards and stores the summary and notes, all in one batch.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id.
 * @param {{ summary: string, notes: object[], cards: { question, answer, stepNumber }[] }} studySet Validated output.
 * @returns {Promise<{ session: object, cards: object[] }>} The ready Session and its new Cards.
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function saveStudySet(uid, sessionId, { summary, notes, cards }) {
  const sessionDoc = sessionRef(uid, sessionId);
  const sessionCards = cardsCollection(uid, sessionId);
  return logCall({ operation: 'firestore.saveStudySet', uid, sessionId }, async () => {
    await readExisting(sessionDoc, sessionMissingMessage);
    const oldCards = await sessionCards.get();
    // One batch: the browser sees the whole new study set or the old one, never half of each.
    const batch = db.batch();
    // A rebuild replaces the previous build's cards.
    for (const oldCard of oldCards.docs) {
      batch.delete(oldCard.ref);
    }
    for (const card of cards) {
      batch.set(sessionCards.doc(), {
        question: card.question,
        answer: card.answer,
        stepNumber: card.stepNumber,
        known: false, // every new card starts as not known yet
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    batch.update(sessionDoc, {
      summary,
      notes,
      cardCount: cards.length,
      status: 'ready',
      errorMessage: null,
      needsRebuild: false,
      builtAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    const savedSession = await sessionDoc.get();
    const savedCards = await readCards(uid, sessionId, false);
    return { session: toSession(savedSession), cards: savedCards };
  });
}

/**
 * Marks a session whose build failed twice, with the message the user sees.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id.
 * @param {string} message Plain sentence shown in the session banner.
 * @returns {Promise<void>}
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function markBuildFailed(uid, sessionId, message) {
  const sessionDoc = sessionRef(uid, sessionId);
  await logCall({ operation: 'firestore.markBuildFailed', uid, sessionId }, async () => {
    await readExisting(sessionDoc, sessionMissingMessage);
    await sessionDoc.update({ status: 'failed', errorMessage: message, updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Saves one tutor question and its answer.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id.
 * @param {{ question: string, answer: string, stepsUsed: number[], covered: boolean }} entry Parsed tutor result.
 * @returns {Promise<object>} The saved Question.
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function addQuestion(uid, sessionId, { question, answer, stepsUsed, covered }) {
  const sessionDoc = sessionRef(uid, sessionId);
  const questionDoc = questionsCollection(uid, sessionId).doc(); // a new document with a random id
  return logCall({ operation: 'firestore.addQuestion', uid, sessionId }, async () => {
    await readExisting(sessionDoc, sessionMissingMessage);
    await questionDoc.set({ question, answer, stepsUsed, covered, askedAt: FieldValue.serverTimestamp() });
    const snapshot = await questionDoc.get();
    return toQuestion(snapshot);
  });
}

/**
 * Lists the session's most recent tutor questions, newest first.
 * @param {string} uid Verified Firebase user id.
 * @param {string} sessionId Session id from the URL.
 * @returns {Promise<object[]>} Up to 20 Question objects.
 * @throws {HttpError} 400 for an invalid id, 404 when the session is missing.
 */
export async function listQuestions(uid, sessionId) {
  const sessionDoc = sessionRef(uid, sessionId);
  return logCall({ operation: 'firestore.listQuestions', uid, sessionId }, async () => {
    await readExisting(sessionDoc, sessionMissingMessage);
    const snapshot = await questionsCollection(uid, sessionId)
      .orderBy('askedAt', 'desc')
      .limit(recentQuestionCount)
      .get();
    return snapshot.docs.map((doc) => toQuestion(doc));
  });
}