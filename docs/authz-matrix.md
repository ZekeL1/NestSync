# NestSync Authorization Matrix

## Purpose
- Define a single source of truth for role-based access control.
- Align frontend visibility with backend enforcement.
- Prevent privilege escalation by requiring server-side checks.

## Roles
- `parent`: controller role with full session control.
- `child`: participant role with restricted control.

## API Authorization Matrix

| Endpoint | Method | Parent | Child | Notes |
|---|---|---|---|---|
| `/health` | GET | Allow | Allow | Public service health endpoint |
| `/auth/login` | POST | Allow | Allow | Public login endpoint |
| `/me` | GET | Allow | Allow | Requires valid token |
| `/features/control-playback` | POST | Allow | Deny | Parent-only synchronized playback control |
| `/features/open-games` | POST | Allow | Allow | Shared feature |
| `/features/open-fairy-tales` | POST | Allow | Allow | Shared feature |
| `/api/register` | POST | Allow | Allow | Phase A: registration is delegated to Cognito user provisioning |
| `/api/login` | POST | Allow | Allow | Legacy path delegates to Cognito-backed auth service |

## Socket Event Authorization Matrix

| Event | Parent | Child | Notes |
|---|---|---|---|
| `create-room` | Allow | Deny | Child should not create authoritative session |
| `join-room` | Allow | Allow | Shared join flow |
| `sync:control` | Allow | Deny | Parent-only control event |
| `load-video` | Allow | Deny | Parent controls media source |
| `play-video` | Allow | Deny | Parent controls playback |
| `pause-video` | Allow | Deny | Parent controls playback |
| `seek-video` | Allow | Deny | Parent controls playback position |
| `chat-message` | Allow | Allow | Shared communication |
| `games:open` | Allow | Allow | Shared feature |
| `webrtc-offer` | Allow | Allow | Shared signaling for call setup |
| `webrtc-answer` | Allow | Allow | Shared signaling for call setup |
| `webrtc-ice-candidate` | Allow | Allow | Shared signaling for call setup |

## Enforcement Rules
- UI-level hiding is not a security boundary; backend must enforce all role checks.
- Token verification is required before every protected API route and socket action.
- Authorization failures should return clear `403` errors with required role info.
- Any new endpoint or event must be added to this matrix before implementation.

## Migration Notes
- During `AUTH_MODE=dev`, demo users still follow this matrix.
- During `AUTH_MODE=cognito`, role is sourced from `custom:role` or Cognito group.
- Legacy `/api/*` endpoints are temporary and should be removed after full migration.

## Open Decisions
- Confirm whether child can create room in specific family scenarios.
- Confirm whether child can control camera toggles independently.
- Confirm whether parent approval is required for child registration.
