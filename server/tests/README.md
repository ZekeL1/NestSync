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

- `loginService.test.js`
- `passwordService.test.js`
- `phaseAPolicyService.test.js`
- `registerService.test.js`
- `roomService.test.js`

### `tests/integration`

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
