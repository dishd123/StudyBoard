import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../frontend/dist');

function getPort(value = process.env.PORT) {
  const port = value === undefined || value === '' ? 8080 : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }
  return port;
}

function sendApiNotFound(_req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested API endpoint does not exist.'
    }
  });
}

function sendApiError(error, req, res, next) {
  if (!req.path.startsWith('/api/')) {
    return next(error);
  }
  if (res.headersSent) {
    return next(error);
  }
  console.error(error);
  res.status(error.statusCode ?? 500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'The server could not complete the request.'
    }
  });
}

export function createApp({ apiRouters = [] } = {}) {
  if (!Array.isArray(apiRouters) || apiRouters.some((router) => typeof router !== 'function')) {
    throw new TypeError('apiRouters must be an array of Express router middleware functions.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  for (const router of apiRouters) {
    app.use(router);
  }

  app.use('/api', sendApiNotFound);
  app.use(sendApiError);
  app.use(express.static(frontendDist));

  return app;
}

export function startServer({ port = getPort(), apiRouters } = {}) {
  const app = createApp({ apiRouters });
  return app.listen(port, () => {
    console.log(`StudyBoard server listening on port ${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}