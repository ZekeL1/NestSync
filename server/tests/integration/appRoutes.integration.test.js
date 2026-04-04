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
    corsOrigins: ["https://allowed.example"]
  }
}));

jest.mock("../../src/auth/tokenService", () => ({
  verifyToken: jest.fn()
}));

jest.mock("../../src/services/loginService", () => ({
  loginWithAuth: jest.fn()
}));

jest.mock("../../src/services/registerService", () => ({
  registerWithAuth: jest.fn()
}));

jest.mock("../../src/services/passwordService", () => ({
  requestPasswordReset: jest.fn(),
  confirmPasswordReset: jest.fn()
}));

jest.mock("../../src/services/offlineStoryService", () => ({
  generateStoryWithOfflineModel: jest.fn()
}));

const { verifyToken } = require("../../src/auth/tokenService");
const { loginWithAuth } = require("../../src/services/loginService");
const { registerWithAuth } = require("../../src/services/registerService");
const {
  requestPasswordReset,
  confirmPasswordReset
} = require("../../src/services/passwordService");
const { generateStoryWithOfflineModel } = require("../../src/services/offlineStoryService");
const { createHttpServer, startServer } = require("../../src/createServer");
const { listen, requestJson } = require("../helpers/httpTestUtils");

describe("integration: auth, feature, and story routes", () => {
  let serverControl;
  let io;

  beforeAll(async () => {
    const bundle = createHttpServer();
    io = bundle.io;
    serverControl = await listen(bundle.httpServer);
  });

  afterAll(async () => {
    if (io) io.close();
    if (serverControl) await serverControl.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
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

  it("handles login, register, and password routes", async () => {
    loginWithAuth.mockResolvedValueOnce({
      ok: true,
      data: {
        accessToken: "jwt-token",
        user: {
          id: "parent-1",
          username: "parentUser",
          displayName: "Parent User",
          role: "parent",
          email: "parent@example.com"
        }
      }
    });
    const loginResponse = await requestJson(serverControl.baseUrl, "/api/login", {
      method: "POST",
      body: {
        username: "parentUser",
        password: "pw"
      }
    });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.json).toEqual({
      success: true,
      accessToken: "jwt-token",
      user: {
        id: "parent-1",
        username: "parentUser",
        nickname: "Parent User",
        role: "parent",
        family_id: null,
        avatar: null,
        email: "parent@example.com"
      }
    });

    loginWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "bad login"
    });
    const loginFail = await requestJson(serverControl.baseUrl, "/api/login", {
      method: "POST",
      body: {
        email: "parent@example.com",
        password: "bad"
      }
    });
    expect(loginFail.status).toBe(401);
    expect(loginFail.json).toEqual({ success: false, message: "bad login" });

    loginWithAuth.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        accessToken: "legacy-auth-token",
        user: {
          id: "parent-1",
          username: "parentUser",
          role: "parent"
        }
      }
    });
    const authLoginResponse = await requestJson(serverControl.baseUrl, "/auth/login", {
      method: "POST",
      body: {
        email: "parent@example.com",
        password: "pw"
      }
    });
    expect(authLoginResponse.status).toBe(200);
    expect(authLoginResponse.json).toEqual({
      accessToken: "legacy-auth-token",
      user: {
        id: "parent-1",
        username: "parentUser",
        role: "parent"
      }
    });

    loginWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "legacy auth blocked"
    });
    const authLoginFail = await requestJson(serverControl.baseUrl, "/auth/login", {
      method: "POST",
      body: {
        username: "parentUser",
        password: "blocked"
      }
    });
    expect(authLoginFail.status).toBe(403);
    expect(authLoginFail.json).toEqual({ error: "legacy auth blocked" });

    registerWithAuth.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: {
        message: "registered",
        user: { username: "childUser" }
      }
    });
    const registerResponse = await requestJson(serverControl.baseUrl, "/api/register", {
      method: "POST",
      body: {
        username: "childUser",
        email: "child@example.com",
        password: "pass123",
        role: "child"
      }
    });
    expect(registerResponse.status).toBe(201);
    expect(registerResponse.json).toEqual({
      success: true,
      message: "registered",
      user: { username: "childUser" }
    });

    requestPasswordReset.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { message: "reset sent" }
    });
    const forgotResponse = await requestJson(serverControl.baseUrl, "/api/password/forgot", {
      method: "POST",
      body: { username: "childUser" }
    });
    expect(forgotResponse.status).toBe(200);
    expect(forgotResponse.json).toEqual({ success: true, message: "reset sent" });

    confirmPasswordReset.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "bad code"
    });
    const resetFail = await requestJson(serverControl.baseUrl, "/api/password/reset", {
      method: "POST",
      body: {
        username: "childUser",
        code: "123456",
        password: "newPass1"
      }
    });
    expect(resetFail.status).toBe(400);
    expect(resetFail.json).toEqual({ success: false, message: "bad code" });
  });

  it("serves protected features and local story routes", async () => {
    process.env.AI_STORY_MODEL = "storybook-mini";

    const modelResponse = await requestJson(serverControl.baseUrl, "/api/ai-fairytale/model");
    expect(modelResponse.status).toBe(200);
    expect(modelResponse.json).toEqual({ ok: true, model: "storybook-mini" });

    const emptyPrompt = await requestJson(serverControl.baseUrl, "/api/ai-fairytale/generate", {
      method: "POST",
      body: { prompt: "   " }
    });
    expect(emptyPrompt.status).toBe(400);
    expect(emptyPrompt.json).toEqual({ ok: false, error: "Prompt is required." });

    generateStoryWithOfflineModel.mockResolvedValueOnce({
      story: "Title\nStory body",
      model: "storybook-mini"
    });
    const generateResponse = await requestJson(serverControl.baseUrl, "/api/ai-fairytale/generate", {
      method: "POST",
      body: { prompt: "Tell a story" }
    });
    expect(generateResponse.status).toBe(200);
    expect(generateResponse.json).toEqual({
      ok: true,
      story: "Title\nStory body",
      model: "storybook-mini"
    });

    generateStoryWithOfflineModel.mockRejectedValueOnce(
      Object.assign(new Error("ollama down"), { status: 503 })
    );
    const generateFail = await requestJson(serverControl.baseUrl, "/api/ai-fairytale/generate", {
      method: "POST",
      body: { prompt: "Tell another story" }
    });
    expect(generateFail.status).toBe(503);
    expect(generateFail.json.ok).toBe(false);
    expect(generateFail.json.error).toContain("ollama down");
    expect(generateFail.json.error).toContain("Ollama");

    const meResponse = await requestJson(serverControl.baseUrl, "/me", {
      headers: {
        Authorization: "Bearer parent-token"
      }
    });
    expect(meResponse.status).toBe(200);

    const playbackAllowed = await requestJson(serverControl.baseUrl, "/features/control-playback", {
      method: "POST",
      headers: {
        Authorization: "Bearer parent-token"
      }
    });
    expect(playbackAllowed.status).toBe(200);
    expect(playbackAllowed.json.ok).toBe(true);

    const playbackDenied = await requestJson(serverControl.baseUrl, "/features/control-playback", {
      method: "POST",
      headers: {
        Authorization: "Bearer child-token"
      }
    });
    expect(playbackDenied.status).toBe(403);
    expect(playbackDenied.json.error).toBe("Forbidden for current role");

    const openGames = await requestJson(serverControl.baseUrl, "/features/open-games", {
      method: "POST",
      headers: {
        Authorization: "Bearer child-token"
      }
    });
    expect(openGames.status).toBe(200);
    expect(openGames.json.action).toBe("open-games");

    const openTales = await requestJson(serverControl.baseUrl, "/features/open-fairy-tales", {
      method: "POST",
      headers: {
        Authorization: "Bearer child-token"
      }
    });
    expect(openTales.status).toBe(200);
    expect(openTales.json.action).toBe("open-fairy-tales");
  });

  it("applies CORS headers for allowed origins and handles OPTIONS", async () => {
    const response = await requestJson(serverControl.baseUrl, "/api/login", {
      method: "OPTIONS",
      headers: {
        Origin: "https://allowed.example"
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://allowed.example");
    expect(response.headers["access-control-allow-methods"]).toBe("GET,POST,PUT,PATCH,DELETE,OPTIONS");
  });

  it("can boot with startServer and serve healthz", async () => {
    const started = await startServer({ port: 0 });

    try {
      const response = await requestJson(`http://127.0.0.1:${started.port}`, "/healthz");
      expect(response.status).toBe(200);
      expect(response.json).toEqual({ status: "ok" });
    } finally {
      started.io.close();
      await new Promise((resolve, reject) => {
        started.httpServer.close((error) => {
          if (error) return reject(error);
          return resolve();
        });
      });
    }
  });
});
