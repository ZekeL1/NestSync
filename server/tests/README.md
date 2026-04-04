# Test Layout

The server test suite is split by responsibility:

- `tests/unit`
  Service-level tests with mocked external dependencies.
- `tests/integration`
  In-process HTTP tests that exercise routes, middleware, and the memory-backed room service together.
- `tests/system`
  Process-level smoke tests that boot `server.js` and verify the real entrypoint responds.

## Current Coverage

### `tests/unit`

- `config.test.js`
  Covers environment loading, `.env` discovery, and parsed config values.
- `cognitoService.test.js`
  Covers Cognito username resolution, login, registration, and password-reset fallbacks.
- `loginService.test.js`
- `middleware.test.js`
  Covers bearer token parsing, authentication failures, and role authorization.
- `offlineStoryService.test.js`
  Covers local story prompt validation, Ollama request handling, and timeout/error mapping.
- `passwordService.test.js`
- `phaseAPolicyService.test.js`
- `registerService.test.js`
- `registerSocketHandlers.test.js`
  Covers socket authentication, room join/leave, chat, video sync, WebRTC forwarding, and role guards.
- `roomDynamoRepository.test.js`
  Covers DynamoDB room/message persistence commands and conditional child binding.
- `roomRepository.test.js`
  Covers backend selection between memory and DynamoDB repositories.
- `roomService.test.js`
- `tokenService.test.js`
  Covers Cognito token verification, token type validation, and identity mapping.

### `tests/integration`

- `appRoutes.integration.test.js`
  Covers `/api/login`, `/api/register`, password reset endpoints, feature routes, AI fairytale routes, CORS handling, and `startServer()`.
- `httpRoutes.integration.test.js`
  Covers authenticated `/me`, room creation, child join, metadata, and message retrieval over HTTP.

### `tests/system`

- `server.system.test.js`
  Boots the real server process and verifies `/healthz` and `/health/auth`.

## Running Tests

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:system
```

From the repo root:

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:system
```

From `server` directly:

```bash
cd server
npm test
npm run test:unit
npm run test:integration
npm run test:system
```

## Coverage

To generate the coverage summary for the currently stable `unit + integration` suite:

```bash
cd server
node ./node_modules/jest/bin/jest.js --runInBand --selectProjects unit integration --coverage --coverageReporters=text-summary
```

To also generate an HTML report:

```bash
cd server
node ./node_modules/jest/bin/jest.js --runInBand --selectProjects unit integration --coverage --coverageReporters=text --coverageReporters=html
```

The HTML report is written to `server/coverage/index.html`.
