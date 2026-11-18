// StudyBoard web server (issue #16): one Express app serves the API under /api and the built frontend pages.
// Start it with `npm start` in backend/; on Cloud Run the root `npm start` starts this same file.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireUser } from './middleware/authMiddleware.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { writeLog } from './services/logCall.js';
import sessionsRouter from './routes/sessions.js';
import photosRouter from './routes/photos.js';
import audioRouter from './routes/audio.js';
import agentsRouter from './routes/agents.js';
import clientLogsRouter from './routes/clientLogs.js';

const serverFolder = path.dirname(fileURLToPath(import.meta.url)); // ES modules have no __dirname
const frontendDist = path.resolve(serverFolder, '../frontend/dist'); // where `vite build` writes the site
const port = Number(process.env.PORT) || 8080; // Cloud Run sets PORT; 8080 locally
// Cloud Run sets K_SERVICE and must reach the server on every interface; anywhere else, only this computer can.
const host = process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1';

/**
 * express.static hook that marks HTML pages as never cached.
 * Without it a browser can keep an old page that points at asset files a new deploy removed.
 * @param {import('express').Response} res The response being prepared.
 * @param {string} filePath The file about to be sent.
 * @returns {void}
 */
function setNoStoreOnHtml(res, filePath) {
  if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store');
  }
}

const app = express();
app.disable('x-powered-by'); // do not announce "Express" in every response header

// Parse JSON bodies up to 100 kB; the audio route reads its larger raw body with its own parser.
app.use(express.json({ limit: '100kb' }));

// API replies hold notes, transcripts and thumbnails; no-store keeps them out of a shared computer's browser cache.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// GET /api/health -> { ok: true }; public, so a deploy can be checked without signing in.
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Every /api route below this line needs a valid Firebase ID token.
app.use('/api', requireUser);
app.use('/api/sessions', sessionsRouter); // three routers share /api/sessions; Express tries each in turn
app.use('/api/sessions', photosRouter);
app.use('/api/sessions', audioRouter);
app.use('/api', agentsRouter); // at /api, not /api/sessions, because it also serves /api/agent-check
app.use('/api/client-logs', clientLogsRouter);
// An /api path that no router answered gets a JSON 404, never an HTML page.
app.use('/api', notFound);

// The built pages, scripts and images. Buildpacks reset file dates to 1980, so ETag and Last-Modified
// can stay the same across deploys; both are turned off.
app.use(express.static(frontendDist, { etag: false, lastModified: false, setHeaders: setNoStoreOnHtml }));

// Last in the chain: turns any error into a { error } JSON reply.
app.use(errorHandler);

const server = app.listen(port, host, (error) => {
  // Express 5 passes a listen failure, such as a port already in use, to this callback.
  if (error) {
    writeLog('ERROR', 'server failed to start', { host, port, errorMessage: error.message });
    process.exitCode = 1;
    return;
  }
  writeLog('INFO', 'server listening', { host, port });
});

// Cloud Run sends SIGTERM before it stops an instance: stop taking new requests and let open ones finish.
process.on('SIGTERM', () => {
  writeLog('INFO', 'server stopping', { host, port });
  server.close();
});