# StudyBoard - CS651 Project 2

StudyBoard turns one photo of a whiteboard or handwritten page, plus the student's spoken explanation of it, into paired study notes and flashcards. Its tutor answers only from the student's saved material.

- Live app: https://studyboard-389363739519.us-central1.run.app
- Wiki (documentation): https://github.com/dishd123/StudyBoard/wiki
- Course: CS651 Web Systems, CSU East Bay, Fall 2026, Group 4: Disha Deshmukh, Huda Joad, Venkatesh Katta, Ndeye Traore

## How it works

1. The user signs in with Google (Firebase Authentication).
2. The user imports one photo from Google Photos (Photos Picker API). Gemini reads it into ordered steps, in a direct call with a JSON schema.
3. The user records an explanation in the browser (up to 3 minutes). Gemini turns it into a transcript and tagged points (explanation, correction, emphasis), in a second direct call.
4. A Google Agent Development Kit (ADK) pipeline, `studySetPipeline`, runs two agents in order. `notesAgent` pairs each written step with what was said and keeps a spoken correction next to the original value. `cardsAgent` then writes flashcards from those notes.
5. `tutorAgent` answers typed questions. It calls the `getSessionNotes` tool, which reads only the signed-in user's session, and says when the material does not cover a question.
6. Firestore stores everything under `users/{uid}/sessions/{sessionId}`, with `cards` and `questions` subcollections. The browser never reads Firestore directly.

One Cloud Run service runs Express, which serves the Project 1 pages, the React app and the `/api` routes from the same origin.

## Folders

| Path | What it holds |
| --- | --- |
| `frontend/` | The Project 1 pages (Home, About, Contact, Sign In), the Privacy page and the React app (`src/`), built with Vite |
| `frontend/src/services/` | Firebase setup, the API client, Google Photos permission, analytics and frontend logging |
| `frontend/src/pages/`, `frontend/src/components/` | The dashboard, the session workspace and its Material, Notes and Study tabs |
| `backend/` | The Express server (`server.js`), with its own `package.json` |
| `backend/middleware/` | Token verification, rate limits, error handling |
| `backend/routes/` | `sessions.js`, `photos.js`, `audio.js`, `agents.js`, `clientLogs.js` |
| `backend/services/` | Firestore (`sessionStore.js`), Google Photos, Gemini, the build and tutor services, logging and GA4 |
| `backend/agents/` | The ADK agents and the `getSessionNotes` tool |
| `backend/scripts/` | Command-line checks of the direct Gemini calls and the agents |
| `backend/tests/` | Unit tests (`node --test`) |
| `docs/` | Proposal, report and slides PDFs; Phase 0 design notes from earlier in the project |
| `DockerContainer/` | Project 1 Part 2 only (Docker on AWS), kept as history; Project 2 does not use it |

## Run it locally

You need Node 24 and the Google Cloud CLI, signed in with `gcloud auth application-default login`. From the repository root:

```bash
npm install --prefix backend
npm install --prefix frontend
cp backend/.env.example backend/.env
```

Fill in the values in `backend/.env`. Then run `npm run dev:backend` in one terminal (Express on http://127.0.0.1:8080) and `npm run dev:frontend` in a second terminal, and open the address Vite prints.

`backend/.env.example` names every setting with a placeholder value. Git ignores `backend/.env`, so your key stays on your computer.

## Scripts

The root `package.json` has these 5 scripts:

| Script | What it does |
| --- | --- |
| `npm run dev:backend` | Starts the Express server and restarts it when a file changes; reads `backend/.env` |
| `npm run dev:frontend` | Starts the Vite dev server, which forwards `/api` calls to port 8080 |
| `npm run build` | Builds the React pages and copies the static pages into `frontend/dist/` |
| `npm run gcp-build` | What Cloud Run runs: installs and builds the frontend, then installs the backend's runtime packages |
| `npm start` | Runs `backend/server.js`, which serves `frontend/dist/` and the API |

The backend checks run from `backend/`:

| Script | What it does |
| --- | --- |
| `npm test` | Runs the unit tests in `backend/tests/` with `node --test` |
| `npm run test:photo -- <image file>` | Sends one photo straight to Gemini and prints the steps it read |
| `npm run test:audio -- <audio file>` | Sends one recording straight to Gemini and prints the transcript and points |
| `npm run test:agents` | Runs the notes, cards and tutor agents on a sample session; it calls Gemini and never Firestore |

## Deploy

From the repository root, with the secrets `gemini-api-key` and `ga4-api-secret` in Secret Manager:

```bash
gcloud run deploy studyboard --source . --region us-central1 \
  --service-account studyboard-run@gen-lang-client-0800605818.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest,GA4_API_SECRET=ga4-api-secret:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=gen-lang-client-0800605818,GEMINI_MODEL=gemini-3.8-flash,GA4_MEASUREMENT_ID=<G- id>,MODEL_CALLS_PER_HOUR=30 \
  --memory 1Gi --timeout 300 --max-instances 3
```

Cloud Run's Node.js buildpack runs the root `gcp-build` script and then `npm start`. `.gcloudignore` keeps `node_modules`, `.env` files, `docs/` and `DockerContainer/` out of the upload.

## Project 1

Project 1 ran on AWS (EC2 and S3) at studyboard.tech, which is now offline. Its wiki pages remain in this wiki, its video is https://youtu.be/u4GmtcjTVLQ, and its answers to Special Issues 1 and 2 are in [docs/Special-Issues.pdf](docs/Special-Issues.pdf). Project 2 serves the same pages from Cloud Run.

## AI use

We used AI tools (Claude, Gemini, and ChatGPT) as assistants during the development and documentation of this project. The StudyBoard team wrote, reviewed, tested, and debugged all final code and docs, and can explain every part of the system.