# DynamoDB tables for NestSync rooms

Use these when deploying to AWS. Leave `DYNAMODB_ROOMS_TABLE` and `DYNAMODB_MESSAGES_TABLE` unset in `.env` to keep the **in-memory** room store (single process, good for local dev).

## NestSyncRooms

- **Partition key:** `roomId` (String)

Attributes: `parentUserId`, `childUserId` (optional), `status` (`WAITING_CHILD` | `BOUND`), `passwordHash` (optional), `createdAt` (Number).

## NestSyncRoomMessages

- **Partition key:** `roomId` (String)  
- **Sort key:** `sortKey` (String) — format: zero-padded timestamp + `#` + random hex for uniqueness and ordering.

Attributes: `senderId`, `senderRole`, `nickname`, `text`, `createdAt` (Number).

## AWS CLI examples (same region as Cognito)

```bash
aws dynamodb create-table \
  --table-name NestSyncRooms \
  --attribute-definitions AttributeName=roomId,AttributeType=S \
  --key-schema AttributeName=roomId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-2

aws dynamodb create-table \
  --table-name NestSyncRoomMessages \
  --attribute-definitions AttributeName=roomId,AttributeType=S AttributeName=sortKey,AttributeType=S \
  --key-schema AttributeName=roomId,KeyType=HASH AttributeName=sortKey,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-2
```

Grant the ECS task role (or your IAM user) `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `Query` on these tables.

## Environment

```env
ROOM_STORE=dynamo
DYNAMODB_ROOMS_TABLE=NestSyncRooms
DYNAMODB_MESSAGES_TABLE=NestSyncRoomMessages
```

`ROOM_STORE=auto` (default) uses DynamoDB when both table names are set; otherwise memory.
