# AWS Migration Roadmap for NestSync

## Objective
- Move NestSync from local-only development to an AWS-backed architecture in controlled phases.
- Keep delivery speed while improving security, scalability, and observability.

## Current Baseline
- Electron frontend in `client/`.
- Node.js backend in `server/` with role-based authorization.
- Auth modes:
  - `dev` for local demo users.
  - `cognito` for AWS-backed login with Cognito.

## Phase 1 - Identity and Access (Now)
- AWS service: Amazon Cognito.
- Outcomes:
  - User login and token issuance handled by Cognito.
  - Roles resolved from `custom:role` or Cognito groups.
  - Backend validates Cognito JWT before role checks.
- Backend requirement:
  - `AUTH_MODE=cognito`
  - `COGNITO_REGION`, `COGNITO_APP_CLIENT_ID`, `COGNITO_ISSUER` configured.

## Phase 2 - API Hosting
- Option A (simpler migration): Deploy existing Node backend to ECS/Fargate.
- Option B (deeper cloud-native): Split endpoints into Lambda + API Gateway.
- Outcomes:
  - Public HTTPS endpoint for frontend API calls.
  - Centralized scaling and deployment pipeline.

## Phase 3 - Data Layer
- User profile and relationship data:
  - DynamoDB for flexible, low-latency records.
  - or Aurora Serverless for relational workloads.
- Media/session metadata:
  - Store in DynamoDB tables with TTL where appropriate.
- Outcomes:
  - No local data dependency.
  - Durable and scalable data storage.

## Phase 4 - Real-Time Sync on AWS
- Keep Socket.io on ECS/Fargate with Redis adapter (ElastiCache) for horizontal scaling.
- Alternative: AWS AppSync subscriptions for managed real-time APIs.
- Outcomes:
  - Scalable multi-device sync behavior.
  - Stable cross-region extension path.

## Phase 5 - Media and Content Delivery
- Store static content in S3.
- Deliver with CloudFront CDN.
- Outcomes:
  - Lower latency global access.
  - Cost-efficient static delivery.

## Phase 6 - Monitoring and Security Hardening
- CloudWatch logs/alarms for backend health and auth failures.
- AWS WAF for API protection.
- Secrets Manager/SSM Parameter Store for secret management.
- Outcomes:
  - Better incident detection.
  - Auditable and secure runtime configuration.

## Immediate Setup Checklist (Fresh AWS Account)
1. Create IAM admin user with MFA, avoid daily use of root account.
2. Create Cognito User Pool and App Client.
3. In App Client, enable `USER_PASSWORD_AUTH`.
4. Add role design:
   - User groups: `parent`, `child`
   - Optional user attribute: `custom:role`
5. Create two test users and assign groups.
6. Update `server/.env` values and set `AUTH_MODE=cognito`.
7. Start backend and verify `POST /auth/login`.

## Recommended Team Execution Pattern
- Sprint N: finalize Cognito auth and role mapping.
- Sprint N+1: move backend runtime to ECS/Fargate.
- Sprint N+2: move data to DynamoDB/Aurora and enable cloud logging.
- Sprint N+3: scale real-time architecture and optimize cost.
