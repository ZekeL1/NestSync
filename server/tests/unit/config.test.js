const path = require("path");

describe("config", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
    jest.clearAllMocks();
    jest.dontMock("fs");
    jest.dontMock("dotenv");
  });

  function loadConfig({ env = {}, existingMatchers = [] } = {}) {
    process.env = { ...originalEnv, ...env };
    const dotenvConfig = jest.fn();

    jest.doMock("fs", () => ({
      existsSync: jest.fn((candidate) => existingMatchers.some((matcher) => matcher.test(candidate)))
    }));
    jest.doMock("dotenv", () => ({
      config: dotenvConfig
    }));

    const mod = require("../../src/config");
    return {
      config: mod.config,
      dotenvConfig
    };
  }

  it("loads server/.env when present", () => {
    const { dotenvConfig } = loadConfig({
      existingMatchers: [/server[\\/]\.env$/]
    });

    expect(dotenvConfig).toHaveBeenCalledWith({
      path: expect.stringMatching(new RegExp(`server[\\\\/]\\.env$`))
    });
  });

  it("falls back to legacy v2 .env when server/.env is absent", () => {
    const { dotenvConfig } = loadConfig({
      existingMatchers: [/server[\\/]v2[\\/]\.env$/]
    });

    expect(dotenvConfig).toHaveBeenCalledWith({
      path: expect.stringMatching(new RegExp(`server[\\\\/]v2[\\\\/]\\.env$`))
    });
  });

  it("parses env values and comma-separated cors origins", () => {
    const { config } = loadConfig({
      env: {
        AUTH_MODE: "memory",
        COGNITO_REGION: "us-test-1",
        COGNITO_USER_POOL_ID: "pool-id",
        COGNITO_APP_CLIENT_ID: "client-id",
        COGNITO_ISSUER: "https://issuer.example.com",
        DYNAMODB_ROOMS_TABLE: "rooms",
        DYNAMODB_MESSAGES_TABLE: "messages",
        ROOM_STORE: "dynamo",
        CORS_ORIGINS: " https://one.example , https://two.example "
      }
    });

    expect(config).toEqual({
      authMode: "memory",
      cognitoRegion: "us-test-1",
      cognitoUserPoolId: "pool-id",
      cognitoAppClientId: "client-id",
      cognitoIssuer: "https://issuer.example.com",
      dynamoRoomsTable: "rooms",
      dynamoMessagesTable: "messages",
      roomStoreBackend: "dynamo",
      corsOrigins: ["https://one.example", "https://two.example"]
    });
  });
});
