# NestSync Backend v2

## Why this folder exists
- This is an isolated backend implementation for auth and role hardening.
- It avoids modifying legacy backend files during migration.

## Features in v2
- JWT auth middleware for protected API and Socket.io events.
- Cognito login path with `AUTH_MODE=cognito`.
- Role enforcement for `parent` and `child`.
- Protected endpoints:
  - `GET /me`
  - `POST /features/control-playback`
  - `POST /features/open-games`
  - `POST /features/open-fairy-tales`

## Run locally
1. `cd server/v2`
2. `npm install`
3. Copy `.env.example` to `.env`
4. `npm run start`

Default port is `3100`.

## Notes
- In `AUTH_MODE=dev`, login uses existing MySQL users from `users` table.
- In `AUTH_MODE=cognito`, login delegates to AWS Cognito.
