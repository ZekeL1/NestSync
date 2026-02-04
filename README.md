# NestSync
ECE651 Project Group2

**NestSync** is a cross-device synchronized media platform designed for remote childcare and companionship. It allows parents and children to watch web-based videos together in real-time and interact through a multi-functional interface, bridging the distance between family members.

---

##  Key Features

NestSync is designed with a **multi-tab interface** to provide a versatile experience for both parents and children:

* **Sync Cinema (Video Tab):** Real-time synchronized video playback. When one user pauses or seeks, the other's screen updates instantly.
* **Mini-Games Tab:** A collection of local interactive games for children to enjoy during downtime.
* **Fairy Tales Tab:** A digital library of storybooks for reading and education.
* **Remote Presence (Planned):** Integrated video call overlay using **WebRTC** to allow parents and children to see each other while interacting with the app.

---

##  Technology Stack

* **Frontend:** [Electron](https://www.electronjs.org/) (Chromium + Node.js)
* **Backend:** [Node.js](https://nodejs.org/)
* **Communication:** [Socket.io](https://socket.io/) (WebSockets for real-time synchronization)
* **P2P Streaming:** WebRTC (for future camera integration)
* **Project Management:** Jira link:https://ece651-group2.atlassian.net/jira/software/projects/NES/boards/34/backlog

---

##  Project Structure (Monorepo)

```text
NestSync/
├── client/           # Electron frontend application
├── server/           # Node.js backend synchronization server
├── docs/             # Project abstract, design diagrams, and PDFs
├── .gitignore        # Git exclusion rules
├── LICENSE           # MIT License
└── README.md         # Project overview and documentation
