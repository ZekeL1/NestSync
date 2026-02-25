# Backend V2 Progress

## Scope
- Built a new isolated backend under `server/v2`.
- Kept legacy backend files untouched for safer review and push.

## New Files Created
- `server/v2/package.json`
- `server/v2/.env.example`
- `server/v2/README.md`
- `server/v2/src/index.js`
- `server/v2/src/config.js`
- `server/v2/src/db/pool.js`
- `server/v2/src/repositories/userRepository.js`
- `server/v2/src/auth/cognitoService.js`
- `server/v2/src/auth/tokenService.js`
- `server/v2/src/auth/middleware.js`
- `server/v2/src/routes/authRoutes.js`
- `server/v2/src/routes/protectedRoutes.js`
- `server/v2/src/socket/registerSocketHandlers.js`

## Implemented Capabilities
- API auth:
  - `POST /auth/login` (supports `dev` and `cognito` modes)
  - `GET /me` with token verification
- Role-protected feature endpoints:
  - `POST /features/control-playback` (`parent` only)
  - `POST /features/open-games` (`parent` and `child`)
  - `POST /features/open-fairy-tales` (`parent` and `child`)
- Socket auth:
  - Token required at handshake
  - Event-level role guard based on authorization matrix

## Runtime Verification
- Installed dependencies in `server/v2` successfully.
- Started backend v2 successfully on port `3100`.
- Verified health endpoint:
  - `GET http://localhost:3100/health`
  - Response: `200 {"status":"ok","service":"nestjsync-server-v2","authMode":"dev"}`

## Legacy Entry Bridge
- Updated `server/server.js` with a thin bridge only:
  - `/api/login` now delegates to `server/v2/src/services/loginService.js`.
  - Mounted v2 API routes via `server/v2/src/legacy/mountV2Api.js`.
- Verified from legacy port `3000`:
  - `GET /health/auth-v2` returns `200`.
  - `POST /api/login` returns v2 validation message structure.

## Phase A (Cloud Auth Policy)
- Enforced Cognito-only login policy in `server/v2/src/services/phaseAPolicyService.js`.
- Replaced local register path with Cognito-backed provisioning:
  - `POST /api/register` now delegates to `server/v2/src/services/registerService.js`.
  - Backend creates user in Cognito and assigns role group.
- Legacy login endpoint remains for compatibility and is Cognito-backed through v2 service.
- Updated `server/v2/.env.example` default mode to `AUTH_MODE=cognito`.
- Runtime verification on legacy port `3000`:
  - `POST /api/register` -> Cognito-backed register flow (requires Cognito config)
  - `POST /api/login` -> `503` until Cognito config is provided
  - `POST /auth/login` -> `503` until Cognito config is provided

## JWT Socket Bridge Update
- Legacy socket registration in `server/server.js` now delegates to:
  - `server/v2/src/legacy/registerLegacySocketBridge.js`
  - `server/v2/src/socket/registerSocketHandlers.js`
- Result:
  - Socket handshake requires token.
  - Legacy room/video/chat/webrtc events are now role-guarded by v2 handler.
- Frontend update:
  - `client/renderer.js` now connects Socket.io only after login and injects `accessToken` in socket auth payload.

## Cognito Register/Login Smoke Test (Latest)
- Backend restarted on `http://localhost:3000`.
- Register endpoint test passed:
  - `POST /api/register` returned `201`.
  - User was provisioned in Cognito with role mapping.
- Login endpoint test with invalid credentials returned `401` as expected.

## Next Step
- Configure real Cognito values in `server/v2/.env`.
- Connect frontend login requests to Cognito-backed endpoints.
- Migrate selected room/sync flows to token-authenticated sockets.
