# Environment configuration

Issue #17 defines the names and ownership of StudyBoard's environment
variables. The repository contains placeholder-only examples:

- [`frontend/.env.example`](../frontend/.env.example) contains browser-visible
  Vite settings.
- [`backend/.env.example`](../backend/.env.example) contains server settings
  and secrets.
- [`.env.example`](../.env.example) is a combined reference for local or
  deployment configuration.

## Local setup

From the repository root:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Replace placeholders only in those ignored local files. Vite automatically
loads `frontend/.env.local` during frontend development and builds. The
backend currently receives variables from its shell or deployment platform;
it does not load `backend/.env` because the backend package does not include
dotenv. For local backend work, export the variables in the shell or use a
supported process manager.

The current implemented backend settings are:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `PORT` | Express | Listening port; defaults to `8080`. |
| `GEMINI_API_KEY` | Gemini agents/audio service | Server-only Gemini credential. |
| `GEMINI_MODEL` | Cards and notes agents | Optional text model; defaults to `gemini-3.8-flash`. |
| `GEMINI_AUDIO_MODEL` | Audio service | Optional audio model; defaults to `gemini-3.8-flash`. |

Firebase, Google OAuth, and GA4 names are reserved configuration contracts for
their integration issues. They are listed now so local and deployment
configuration can be prepared without putting secrets in source control.

## Public versus secret configuration

`VITE_*` values are intentionally public: Vite embeds them in JavaScript sent
to every browser. Firebase web configuration and an OAuth client ID are not
server credentials, but they still need Firebase and OAuth security rules.

Never use a `VITE_` prefix for `GEMINI_API_KEY`, `GA4_API_SECRET`, Firebase Admin
credentials, private keys, or any other server secret. Do not commit populated
`.env` files, service-account JSON files, private keys, or API secrets.

`VITE_ANALYTICS_ENABLED` and `ANALYTICS_ENABLED` default to `false` in the
examples. Enabling them before the corresponding analytics implementation and
GA4 property are configured must be treated as a separate change.
