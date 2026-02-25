# User Authentication and Role Plan (AWS-First, Empty Account)

## Scope
- Build user authentication and role-based authorization for NestSync.
- Assume the AWS account is brand new with no pre-existing resources.
- Enforce project requirement: all code, comments, and instructions are English-only and contain no emoji.

## Role Model
- `parent`: full control of account and synchronized session actions.
- `child`: restricted control, can join and consume content with limited actions.
- Optional later: `admin` for operations and support.

## Target Architecture
- Identity: Amazon Cognito User Pool.
- API/Auth backend: Node.js service in `server/`.
- Authorization model: JWT claims + backend role guard middleware.
- Real-time channel: Socket.io with token verification during handshake.
- Data persistence (optional phase): DynamoDB table for profile/relationship data.

## Phase 0 - Foundations
1. Create AWS IAM admin user with MFA and disable root daily usage.
2. Configure AWS CLI profile for the new account.
3. Create SSM Parameter Store paths for app config placeholders.
4. Define environments: `dev`, `staging`, `prod` naming convention.

## Phase 1 - Cognito Setup
1. Create Cognito User Pool (`nestjsync-dev-users`).
2. Create App Client (no secret for desktop client flow).
3. Configure sign-in aliases (email), password policy, and verification rules.
4. Add custom attribute `custom:role` with allowed values (`parent`, `child`).
5. Create groups: `parent`, `child`.
6. Configure Hosted UI only if browser-based sign-in is needed later.

## Phase 2 - Server Auth Module
1. Initialize `server/` Node.js project with Express + Socket.io.
2. Add auth dependencies (JWT verification and Cognito JWKS validation).
3. Implement middleware:
   - `authenticateToken`: validates JWT and attaches identity.
   - `authorizeRoles(...roles)`: enforces role checks.
4. Add endpoints:
   - `GET /me` (authenticated profile)
   - `GET /admin/health-auth` (role-protected validation endpoint)
5. Add Socket.io auth guard in connection handshake.

## Phase 3 - User Lifecycle
1. Registration flow:
   - Parent self-registration.
   - Child account creation by parent (admin workflow or invite flow).
2. Login flow:
   - Username/password with Cognito.
   - Token refresh handling.
3. Password recovery flow with Cognito reset APIs.
4. Role assignment:
   - Assign via Cognito groups at provisioning time.
   - Mirror role in token claim for fast authorization checks.

## Phase 4 - Frontend Integration (Electron)
1. Add login/register screens in `client/`.
2. Store tokens securely (prefer OS keychain integration).
3. Attach access token to API requests.
4. Gate UI actions by role:
   - Parent-only controls for synchronized playback authority.
   - Child UI shows restricted actions.
5. Handle expired sessions and re-auth gracefully.

## Phase 5 - Security and Operations
1. Use HTTPS for all API calls in non-local environments.
2. Add rate limiting and brute-force protection on auth endpoints.
3. Log auth events with structured logs (no secrets in logs).
4. Rotate secrets/keys and enforce least-privilege IAM policies.
5. Add CloudWatch alarms for login failures and token validation errors.

## Phase 6 - Testing and Acceptance
1. Unit tests for middleware and role guards.
2. Integration tests for auth endpoints with valid/invalid tokens.
3. End-to-end tests:
   - Parent login and parent-only action success.
   - Child login and blocked parent-only action.
4. Security checks:
   - Expired token rejected.
   - Tampered token rejected.
   - Missing role claim rejected for protected routes.

## Deliverables
- `server/` auth module with JWT verification and role guards.
- Electron auth UI and role-aware feature gating.
- Environment configuration template for AWS resources.
- Test suite covering authentication and authorization flows.

## Immediate Next Step
- Start Phase 1 and Phase 2 in parallel:
  - Provision Cognito resources.
  - Scaffold `server/` with auth middleware and `/me` endpoint first.
