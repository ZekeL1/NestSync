# NestSync Cloud Deploy Checklist

## 1) Backend on Railway

- Service root: repository root
- Build source: `server/Dockerfile` (configured in `railway.json`)
- Health check: `/healthz`

Set these Railway env vars:

- `AUTH_MODE=cognito`
- `COGNITO_REGION=...`
- `COGNITO_USER_POOL_ID=...`
- `COGNITO_APP_CLIENT_ID=...`
- `COGNITO_ISSUER=...`
- `ROOM_STORE=dynamo` (or `memory` for temporary testing)
- `DYNAMODB_ROOMS_TABLE=...`
- `DYNAMODB_MESSAGES_TABLE=...`
- `CORS_ORIGINS=https://<your-vercel-domain>,http://localhost:3000`

Smoke tests after deploy:

- `GET /healthz` returns `{"status":"ok"}`
- `GET /health/auth` returns status 200

## 2) Frontend on Vercel

- Project root: `client`
- Build config: `client/vercel.json`
- Environment variable: `NESTSYNC_API_BASE=https://<your-railway-domain>`

The build step generates `runtime-config.js`, and frontend uses that API base for:

- REST: `/api/*`
- Socket.io: room/chat/video real-time events

## 3) Cross-device real-time verification

1. Open Vercel URL on device A (Parent), login and create room.
2. Open same Vercel URL on device B (Child), join same room.
3. Verify:
   - join success in both UIs
   - chat messages are real-time
   - video load/play/pause/seek syncs
   - room password works when enabled

## 4) Security reminders

- Never commit `.env` files.
- Keep credentials only in Railway/Vercel environment variables.
- Keep `CORS_ORIGINS` restricted to known domains.
