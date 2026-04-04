jest.mock("../../src/config", () => ({
  config: {
    authMode: "cognito",
    cognitoRegion: "us-east-2",
    cognitoUserPoolId: "pool-123",
    cognitoAppClientId: "client-456",
    cognitoIssuer: "https://cognito-idp.us-east-2.amazonaws.com/pool-123",
    dynamoRoomsTable: "",
    dynamoMessagesTable: "",
    roomStoreBackend: "memory",
    corsOrigins: []
  }
}));

jest.mock("../../src/auth/tokenService", () => ({
  verifyToken: jest.fn()
}));

const { verifyToken } = require("../../src/auth/tokenService");
const { createHttpServer } = require("../../src/createServer");
const roomMemoryRepository = require("../../src/services/roomMemoryRepository");
const roomService = require("../../src/services/roomService");
const { listen, requestJson } = require("../helpers/httpTestUtils");

describe("integration: HTTP routes", () => {
  let serverControl;
  let io;

  beforeAll(async () => {
    const serverBundle = createHttpServer();
    io = serverBundle.io;
    serverControl = await listen(serverBundle.httpServer);
  });

  afterAll(async () => {
    if (io) {
      io.close();
    }
    if (serverControl) {
      await serverControl.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    roomMemoryRepository.clearForTests();
    verifyToken.mockImplementation(async (token) => {
      if (token === "parent-token") {
        return {
          userId: "parent-1",
          username: "parentUser",
          email: "parent@example.com",
          role: "parent",
          displayName: "Parent User"
        };
      }

      if (token === "child-token") {
        return {
          userId: "child-1",
          username: "childUser",
          email: "child@example.com",
          role: "child",
          displayName: "Child User"
        };
      }

      throw new Error("Invalid token");
    });
  });

  it("returns the authenticated identity from /me", async () => {
    const response = await requestJson(serverControl.baseUrl, "/me", {
      headers: {
        Authorization: "Bearer parent-token"
      }
    });

    expect(response.status).toBe(200);
    expect(response.json).toEqual({
      userId: "parent-1",
      username: "parentUser",
      email: "parent@example.com",
      role: "parent",
      displayName: "Parent User"
    });
  });

  it("creates a room, binds a child, and exposes room state through HTTP", async () => {
    const createResponse = await requestJson(serverControl.baseUrl, "/api/rooms", {
      method: "POST",
      headers: {
        Authorization: "Bearer parent-token"
      },
      body: {
        password: "open123"
      }
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.json.success).toBe(true);
    expect(createResponse.json.roomId).toMatch(/^\d{4}$/);

    const roomId = createResponse.json.roomId;

    const metaBeforeJoin = await requestJson(
      serverControl.baseUrl,
      `/api/rooms/${roomId}/meta`,
      {
        headers: {
          Authorization: "Bearer parent-token"
        }
      }
    );

    expect(metaBeforeJoin.status).toBe(200);
    expect(metaBeforeJoin.json).toEqual({
      exists: true,
      requiresPassword: true,
      status: "WAITING_CHILD",
      hasChild: false
    });

    const joinResponse = await requestJson(serverControl.baseUrl, `/api/rooms/${roomId}/join`, {
      method: "POST",
      headers: {
        Authorization: "Bearer child-token"
      },
      body: {
        password: "open123"
      }
    });

    expect(joinResponse.status).toBe(200);
    expect(joinResponse.json).toEqual({
      success: true,
      roomId,
      status: "BOUND"
    });

    await roomService.appendChatMessage({
      roomId,
      senderId: "parent-1",
      senderRole: "parent",
      nickname: "Parent User",
      text: "hello from parent"
    });

    const messagesResponse = await requestJson(
      serverControl.baseUrl,
      `/api/rooms/${roomId}/messages?limit=10`,
      {
        headers: {
          Authorization: "Bearer child-token"
        }
      }
    );

    expect(messagesResponse.status).toBe(200);
    expect(messagesResponse.json.success).toBe(true);
    expect(messagesResponse.json.messages).toHaveLength(1);
    expect(messagesResponse.json.messages[0]).toMatchObject({
      senderId: "parent-1",
      senderRole: "parent",
      nickname: "Parent User",
      text: "hello from parent"
    });
  });
});
