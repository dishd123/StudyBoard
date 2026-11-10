# StudyBoard — CS651 Project 2

StudyBoard extends the Project 1 site into a study workspace for one board photo
and one runtime spoken explanation per session. The existing frontend is now in
`frontend/`; the plain JavaScript backend modules are in `backend/`. The revised
October 19 proposal targets one Express/Cloud Run service. Server integration
and deployment are still separate issues; the current frontend uses fixtures
with local microphone capture.

See [frontend layout and migration checks](docs/frontend-layout.md) for issue #15.

## Project 1 references

The following links and deployment notes are retained from Project 1; they are
not a claim that the Project 2 service is deployed.

| Item | Value |
| --- | --- |
| Live site | http://studyboard.tech/ |
| Backup address | http://23.21.105.57/ (the server's Elastic IP) |
| Wiki | https://github.com/dishd123/CS651-Project-1-Part2/wiki |
| YouTube video | https://youtu.be/u4GmtcjTVLQ |
| Special Issues PDF | [docs/Special-Issues.pdf](docs/Special-Issues.pdf) |
| Build and deploy steps | [DockerContainer/README.md](DockerContainer/README.md) |

The server runs in an AWS Academy Learner Lab, which stops it whenever no lab session is open (sessions last 4 hours). If the site does not load, the lab is not running; the wiki and the video show it running at this address. The site is plain HTTP: type `http://` in front of the address, and if Chrome says the connection is not secure, choose Continue to site.

## Group

CS651 Web Systems, CSU East Bay, Fall 2026: Disha Deshmukh, Huda Joad, Venkatesh Katta, Ndeye Traore.

## What is where

| Path | What it holds |
| --- | --- |
| `DockerContainer/` | `Dockerfile`, `httpd.conf`, and the README with the build and deploy steps |
| `frontend/index.html`, `frontend/about.html`, `frontend/contact.html` | The Home, About and Contact pages |
| `frontend/app/`, `frontend/login/` | Retained App and Sign In HTML entry points |
| `frontend/src/` | Existing React app, components, fixtures, models, services, and login |
| `frontend/css/site.css`, `frontend/js/site.js` | Shared styles and static-page menu/footer/contact script |
| `frontend/public/images/` | The existing page and sample-board images |
| `frontend/tests/` | Phase 0 and recorder tests; [test instructions](frontend/tests/README.md) |
| `frontend/package.json`, `frontend/package-lock.json` | Frontend dependencies and commands; its Vite/Vitest configs live beside them |
| `backend/` | Backend agents, services, routes, tests, and its separate package/lockfile |
| Root `package.json` | Convenience commands that delegate to `frontend/`; deployment scripts are issue #13 |
| `docs/Special-Issues.pdf` | The answers to Special Issues 1 and 2 |

## Run it locally

From the repository root, install the frontend package and start Vite:

```bash
npm ci --prefix frontend
npm run dev
```

Use Vite's printed address (normally `http://localhost:5173`) and the existing
`/`, `/about.html`, `/contact.html`, `/app/`, and `/login/` routes.

```bash
npm run test:frontend
npm run build
npm run preview
```

The build is written to `frontend/dist/`. Root commands delegate to the frontend
package and forward arguments, such as `npm run dev -- --port 5174`. Running the
same commands inside `frontend/` also works. Root `npm ci` alone does not install
the child packages; use the explicit frontend installation command above.

Backend development uses its own package, for example `npm ci --prefix backend`
and `npm test --prefix backend`. It is not needed for the current frontend preview.
The retained static Apache/Docker workflow is documented separately in
[DockerContainer/README.md](DockerContainer/README.md); it does not serve the
Project 2 API.

Historical Project 1 AI-use statement: Claude (Anthropic), ChatGPT (OpenAI) and GitHub Copilot helped plan the deployment steps, work through code and commands, check AWS prices and limits, and draft and edit the documentation. I, Disha Deshmukh, ran every command, made every console change and took every screenshot.
