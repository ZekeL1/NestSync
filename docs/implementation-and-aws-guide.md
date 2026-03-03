# Implementation and AWS Guide

## Scope
- Consolidated summary of all authentication and authorization changes.
- Frontend and backend change log in one file.
- AWS Cognito setup guide for teammates.
- Security rules for credentials and secrets.

## Final Architecture
- Legacy server entry remains: `server/server.js`.
- New authentication and authorization logic now lives in `server/src`.
- Legacy routes are thin wrappers that delegate to `server/src` services.
- Socket.io legacy entry delegates to `server/src/socket` handlers with token and role checks.

## What Changed - Frontend
- File changed: `client/renderer.js`.

### Authentication Flow
- Login page and app page are separated by auth state.
- Register and login forms now toggle correctly with:
  - `show-register`
  - `show-login`
- Login uses `POST /api/login`.
- Register uses `POST /api/register`.

### Frontend Page Details (For Team Handoff)
- Login form fields:
  - `#login-username`
  - `#login-password`
- Register form fields:
  - `#reg-username`
  - `#reg-email`
  - `#reg-nickname`
  - `#reg-password`
  - `role` radio (`parent` or `child`)
- Register success behavior:
  - Shows success toast
  - Switches back to login form automatically
- Login success behavior:
  - Stores returned `accessToken`
  - Updates user name and role on sidebar
  - Connects Socket.io with token in handshake auth
- Login/register error behavior:
  - Backend error messages are shown as toast

### Socket Security
- Socket connects only after successful login.
- JWT token is attached in `socket.auth.token` during handshake.
- `connect_error` is surfaced to the user with clear toast messages.

### Role-Aware Behavior
- Parent-only actions remain restricted.
- Child-visible behavior remains aligned with backend role checks.

## What Changed - Backend
- File changed: `server/server.js` (thin bridge only).
- New backend module: `server/src`.

### API
- `POST /api/register` delegates to Cognito-backed registration service.
- `POST /api/login` delegates to Cognito-backed login service.
- Password reset APIs added:
  - `POST /api/password/forgot`
  - `POST /api/password/reset`
- Protected routes are mounted from `server/src/routes`:
  - `GET /me`
  - `POST /features/control-playback`
  - `POST /features/open-games`
  - `POST /features/open-fairy-tales`

### Cognito Integration
- Registration and login services are in:
  - `server/src/services/registerService.js`
  - `server/src/services/loginService.js`
- Cognito API integration is in:
  - `server/src/auth/cognitoService.js`
- Token verification and role extraction are in:
  - `server/src/auth/tokenService.js`

### Email Verification / Invitation Behavior
- Registration now triggers Cognito email delivery by using `AdminCreateUser` with `DesiredDeliveryMediums: ["EMAIL"]`.
- Current implementation sends Cognito account email (verification/invitation style).
- If your pool requires explicit code confirmation flow, add a dedicated confirm endpoint and UI step later.

## Simplification Applied
- Removed duplicate transitional backend tree: `server/v2/src/**` (migrated into `server/src`).
- Removed duplicate/temporary multi-file docs and consolidated into this single guide.
- Kept one active backend path: `server/server.js` + `server/src/**`.

## AWS Configuration Guide (Teammates)

### 1) Cognito User Pool
- Create or use an existing user pool.
- Sign-in identifiers: `username` (email optional but recommended).
- Ensure password policy matches app registration behavior.

### 2) App Client
- Create app client without secret (public style for this flow).
- Enable authentication flow:
  - `USER_PASSWORD_AUTH`

### 3) Roles
- Create groups:
  - `parent`
  - `child`
- Create custom user attribute:
  - `custom:role` (string)

### 4) Backend Env File
- Configure `server/.env`:

```env
AUTH_MODE=cognito
COGNITO_REGION=<region>
COGNITO_USER_POOL_ID=<pool_id>
COGNITO_APP_CLIENT_ID=<app_client_id>
COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<pool_id>
```

### 5) AWS Credentials on Local Machine
- Install AWS CLI.
- Configure credentials:
  - `aws configure`
- Required IAM permissions include:
  - `cognito-idp:InitiateAuth`
  - `cognito-idp:AdminCreateUser`
  - `cognito-idp:AdminSetUserPassword`
  - `cognito-idp:AdminAddUserToGroup`
  - `cognito-idp:ForgotPassword`
  - `cognito-idp:ConfirmForgotPassword`
  - `cognito-idp:AdminUpdateUserAttributes` (used to set email_verified before sending reset code)

### 6) Run
- Start backend:
  - `cd server`
  - `npm run start`
- Start frontend:
  - `cd client`
  - `npm run start`

## Security Requirements
- Never commit secrets, keys, or passwords to git.
- Keep `.env` local only and out of git.
- Before any push, verify staged files do not include credentials.
- User-specific key files must be distributed privately, never through repository commits.

## Password Reset Behavior
- Forgot password email reset is supported through Cognito-backed endpoints:
  - `POST /api/password/forgot`
  - `POST /api/password/reset`
- Frontend includes forgot/reset forms (forgot-form, reset-form) in the auth overlay.

## Password Reset Email Troubleshooting

If the verification code email is not received after requesting a password reset:

### 1. `email_verified` attribute
Cognito may not send forgot-password emails when `email_verified` is `false`. Since registration has no separate email verification step, the server now **automatically sets `email_verified: true`** when a user requests a password reset (as long as the email exists in the pool). No manual verification needed.

### 2. SES sandbox mode
If your User Pool uses "Send email with Amazon SES" and SES is in sandbox mode, you can only send to **verified** recipient addresses. Either:
- Add the recipient email as a verified identity in SES (SES → Verified identities → Create identity), or
- Request production access for SES to send to any address.

### 3. Cognito default email limits
With "Send email with Cognito" (default), Cognito has daily limits. For higher volume, switch to "Send email with Amazon SES" in the User Pool Messaging tab.

### 4. Check spam / junk
Cognito emails often land in spam. Ask users to check spam and add the sender to contacts.

### 5. User Pool messaging
In Cognito → User Pools → your pool → Messaging → Message customizations, ensure the "Verification message" template is configured for forgot-password codes.
