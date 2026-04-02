# Unit Tests Summary

This directory contains unit tests for the NestSync server authentication and policy services. All tests use mocks for external dependencies (AWS Cognito, config) and require no real AWS credentials.

## Test Files

### 1. `passwordService.test.js`

Tests for password reset flow: request reset code and confirm reset with new password.

| Test | Description |
|------|-------------|
| **requestPasswordReset** | |
| Missing username/email | Returns 400 when principal is not provided |
| Null payload | Returns 400 when payload is null |
| Valid email | Calls Cognito and returns success when email is provided |
| Valid username | Calls Cognito and returns success when username is provided |
| UserNotFoundException | Maps Cognito error to 404 "User does not exist" |
| **confirmPasswordReset** | |
| Missing principal | Returns 400 when username/email is missing |
| Missing code | Returns 400 when verification code is missing |
| Missing newPassword | Returns 400 when new password is missing |
| Password too short | Returns 400 when password has fewer than 6 characters |
| Password without number | Returns 400 when password has no digit |
| Password without letter | Returns 400 when password has no letter |
| Valid password | Calls Cognito and returns success for valid format (6+ chars, letter + number) |
| CodeMismatchException | Maps Cognito error to 400 "Verification code is invalid" |

### 2. `phaseAPolicyService.test.js`

Tests for auth policy enforcement: Cognito configuration validation.

| Test | Description |
|------|-------------|
| **enforceCognitoOnlyForLogin** | |
| Cognito configured | Returns ok when all Cognito config is present |
| Invalid authMode | Returns 503 when AUTH_MODE is not "cognito" |
| Missing cognitoRegion | Returns 503 when COGNITO_REGION is missing |
| **enforceCognitoOnlyForRegister** | |
| Cognito configured | Returns ok when all Cognito config is present |
| Invalid authMode | Returns 503 when AUTH_MODE is not "cognito" |
| Missing cognitoUserPoolId | Returns 503 when COGNITO_USER_POOL_ID is missing |

### 3. `registerService.test.js`

Tests for user registration: validation and Cognito integration.

| Test | Description |
|------|-------------|
| Missing username | Returns 400 when username is not provided |
| Invalid role | Returns 400 when role is not "parent" or "child" |
| Password too short | Returns 400 when password has fewer than 6 characters |
| Invalid username format | Returns 400 when username is shorter than 3 characters |
| Invalid email format | Returns 400 when email is malformed |
| Valid payload | Calls Cognito and returns 201 when all fields are valid |
| Payload normalization | Lowercases email and trims nickname before Cognito call |
| Duplicate email | Maps `EmailAlreadyExistsException` to 409 |
| InvalidPasswordException | Maps Cognito password policy failure to 400 |

### 4. `loginService.test.js`

Tests for Cognito login flow: input validation, policy checks, token verification, and Cognito error mapping.

| Test | Description |
|------|-------------|
| Missing principal/password | Returns 400 when login payload is incomplete |
| Policy failure | Returns the policy error before contacting Cognito |
| Successful login | Resolves username, logs in with Cognito, verifies token, and returns user data |
| Missing role in token | Returns 403 when verified token lacks a role |
| Error mapping | Covers invalid credentials, unconfirmed user, password reset required, missing AWS credentials, and unexpected errors |

### 5. `roomService.test.js`

Uses the **memory** room store (`ROOM_STORE=memory`). Each test clears the in-memory store via `clearForTests()`.

| Test | Description |
|------|-------------|
| Creates a room for parent | Returns a 4-digit `roomId` |
| Empty password string | Treated as no room password (`requiresPassword` false) |
| Password hashing | Stores a bcrypt hash instead of the raw room password |
| Parent access | Parent can access their own room |
| Missing room | `NOT_FOUND` / 404 for bogus `roomId` |
| Wrong parent | `NOT_ROOM_PARENT` / 403 if another user joins as parent |
| Wrong child password | `BAD_PASSWORD` / 401 |
| Child binding | First child binds; second child `ROOM_FULL` |
| Child rejoin | Bound child can rejoin without password |
| Parent as child role | `BAD_ROLE` if parent `sub` used as child |
| Unknown role | e.g. `teacher` → `BAD_ROLE` / 400 |
| `getRoomMeta` | `exists`, `requiresPassword`, `hasChild`, `status` |
| Missing room meta | `exists: false` |
| Chat | Single message persisted |
| Multiple messages | Order preserved (`a` then `b`) |
| Message limit | Returns only the latest `n` chat messages |
| Pagination | Supports `startAfter` to fetch messages after a known sort key |

## Running Tests

```bash
cd server
npm test
```

Coverage report is printed after each run.
