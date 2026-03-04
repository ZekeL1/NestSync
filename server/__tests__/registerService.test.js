const { registerWithAuth } = require("../src/services/registerService");

jest.mock("../src/auth/cognitoService", () => ({
  registerUserWithCognito: jest.fn()
}));

jest.mock("../src/config", () => ({
  config: {
    authMode: "cognito",
    cognitoRegion: "us-east-2",
    cognitoUserPoolId: "pool-123",
    cognitoAppClientId: "client-456",
    cognitoIssuer: "https://cognito-idp.us-east-2.amazonaws.com/pool-123"
  }
}));

describe("registerService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when username is missing", async () => {
    const result = await registerWithAuth({
      email: "test@example.com",
      password: "pass123",
      role: "parent"
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("required");
  });

  it("returns 400 when role is invalid", async () => {
    const result = await registerWithAuth({
      username: "alice",
      email: "alice@example.com",
      password: "pass123",
      role: "admin"
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("parent");
  });

  it("returns 400 when password too short", async () => {
    const result = await registerWithAuth({
      username: "alice",
      email: "alice@example.com",
      password: "abc12",
      role: "parent"
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("returns 400 when username format invalid", async () => {
    const result = await registerWithAuth({
      username: "ab",
      email: "alice@example.com",
      password: "pass123",
      role: "parent"
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("3-32");
  });

  it("calls Cognito when payload is valid", async () => {
    const cognito = require("../src/auth/cognitoService");
    cognito.registerUserWithCognito.mockResolvedValue({
      username: "alice",
      email: "alice@example.com",
      role: "parent",
      displayName: "alice"
    });
    const result = await registerWithAuth({
      username: "alice",
      email: "alice@example.com",
      password: "pass123",
      role: "parent"
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    expect(cognito.registerUserWithCognito).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "alice",
        email: "alice@example.com",
        role: "parent"
      })
    );
  });
});
