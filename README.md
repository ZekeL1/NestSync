# NestSync
ECE651 Project Group2

**NestSync** It is a cross-device synchronous media platform for remote parenting and companionship. Parents and children can watch online videos together in real time and interact through a multi-functional interface, bringing family members closer together.

---

## Core Function

NestSync adopts a **MultiT Tab** interface, providing parents and children with a rich experience

| Module | Explain |
|--------|---------|
| **Sync Cinema** | Real-time synchronous playback based on web page videos. When one side pauses or seeks, the other side's screen is updated synchronously.|
| **Arcade** | It comes with the built-in Pictionary game "You Draw, I Guess" and supports multi-person collaboration in the same room. |
| **Fairy Tales** | Digital fairy tale library, including picture book readings such as "Cinderella", "Peter Pan", and "Little Red Riding Hood". |
| **Family Link** | WebRTC video calls and text chats support real-time video overlay.|

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | [Electron](https://www.electronjs.org/) (Chromium + Node.js) |
| Backend | [Express](https://expressjs.com/) + [Node.js](https://nodejs.org/) |
| Real-time Communication | [Socket.io](https://socket.io/) (WebSocket) |
| Video Synchronization | YouTube IFrame API |
| P2P Video | WebRTC |
| Data Storage | MySQL |
| Authentication | bcrypt（local）/ AWS Cognito（Optional） |
| Project Management | [Jira](https://ece651-group2.atlassian.net/jira/software/projects/NES/boards/34/backlog) |

---

## Project Structure

```
NestSync/
├── client/                 # Electron desktop client
│   ├── main.js             # Electron main process
│   ├── renderer.js         # Rendering process logic (login, cinema, chat, WebRTC)
│   ├── index.html          # Home page
│   ├── style.css           # Style
│   ├── package.json
│   └── games/              # Game frontend
│       ├── index.js        # Arcade interface
│       └── pictionary.js   # Pictionary "you draw, I guess"
├── server/                 # Express backend
│   ├── server.js           # Main entrance（API + Socket.io）
│   ├── db.js               # MySQL connection
│   ├── .env.example        # Example of environment variables
│   ├── package.json
│   ├── games/              # Game backend logic
│   │   ├── index.js
│   │   └── pictionary.js   # Pictionary Socket
│   └── src/                # Modular services (such as Cognito, etc)
│       ├── config.js
│       ├── auth/           # Cognito, JWT, etc
│       ├── routes/         # Authenticated routes, protected routes
│       ├── services/       # Login, password and other services
│       └── legacy/         # API mounting
├── package.json            # Root dependencies (bcrypt, express, etc.)
└── README.md
```

---

## Quick Start

### 1. Environmental Requirement

- Node.js 18+
- MySQL 8+
- Optional：AWS Cognito（For cloud authentication）

### 2. Configuration Database

Create a MySQL database and perform table creation (example) :

```sql
CREATE DATABASE nestsync_user_db;

USE nestsync_user_db;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('parent','child') NOT NULL,
  nickname VARCHAR(64),
  email VARCHAR(128),
  family_id VARCHAR(36),
  avatar VARCHAR(64) DEFAULT 'default.png',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Configure environment variables

**Only `server/.env` is used.** The backend does **not** read a `.env` in the **project root**—keep all secrets in `server/.env` (or they will be ignored).

1. Copy `server/.env.example` to `server/.env` in the same folder.
2. Fill in Cognito values from your AWS Cognito User Pool (replace `replace_me` placeholders).
3. Optionally uncomment DynamoDB lines in `server/.env` when you use persistent rooms on AWS (see `docs/dynamodb-nestsync.md`).

The authoritative template is always `server/.env.example`; you can paste it into `server/.env` unchanged first, then edit only what you need.

### 4. Install Dependencies

```bash
# Root
npm install

# Server-side
cd server && npm install

# Client-side
cd client && npm install
```

### 5. Start Service

```bash
# Terminal 1: Start the backend
cd server && npm start

# Terminal 2: Start the Electron client
cd client && npm start
```

The client is connected by default to  `http://localhost:3000`.

---

## Testing

Unit tests are in `server/__tests__/` and use [Jest](https://jestjs.io/). No AWS credentials or database are required—all external dependencies are mocked.

```bash
cd server
npm test
```

This runs tests for `passwordService`, `phaseAPolicyService`, `registerService`, and `roomService`, and prints a coverage report. See `server/__tests__/README.md` for a full list of test cases.

---

## API Overview

| Method | Path | Explain |
|--------|------|---------|
| POST | `/api/register` | User registration (username, password, role, nickname, email)|
| POST | `/api/login` | User login (username, password)|
| POST | `/api/rooms` | Parent only — create a room; optional JSON `{ "password": "..." }` |
| POST | `/api/rooms/:roomId/join` | Join room (validates password / child binding); optional `{ "password": "..." }` |
| GET | `/api/rooms/:roomId/meta` | Whether the room exists and if a password is required |
| GET | `/api/rooms/:roomId/messages` | Chat history (members only) |

Rooms are **1 parent + 1 child** (first child binds; optional room password). Persisted in **DynamoDB** when `DYNAMODB_ROOMS_TABLE` and `DYNAMODB_MESSAGES_TABLE` are set; otherwise **in-memory** (dev). See `docs/dynamodb-nestsync.md`.

## Socket.io Event

- **Room**：`join-room` (payload `{ roomId, password? }`), `room-joined`, `leave-room` — create room via `POST /api/rooms` first
- **Video**：`load-video`, `play-video`, `pause-video`, `seek-video`
- **Chat**：`chat-message`
- **WebRTC**：`webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate`
- **Pictionary**：`pict-set-profile`, `pict-start`, `pict-draw`, `pict-guess`, `pict-end-round`, `pict-clear` etc.

---

## Role Permission

- **Parent**：Can create rooms, load/control videos, and initiate video calls
- **Child**：Can join the room, watch synchronized videos, participate in games and read fairy tales

---
