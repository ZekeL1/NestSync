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

const cognito = require("../src/auth/cognitoService");

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

  it("returns 400 when email format is invalid", async () => {
    const result = await registerWithAuth({
      username: "alice",
      email: "not-an-email",
      password: "pass123",
      role: "parent"
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("valid email");
  });

  it("calls Cognito when payload is valid", async () => {
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

  it("normalizes username, email, and nickname before calling Cognito", async () => {
    cognito.registerUserWithCognito.mockResolvedValue({
      username: "Alice",
      email: "alice@example.com",
      role: "child",
      displayName: "Dad"
    });

    const result = await registerWithAuth({
      username: "Alice",
      email: "Alice@Example.COM ",
      password: "pass123",
      role: "child",
      nickname: " Dad "
    });

    expect(result.ok).toBe(true);
    expect(cognito.registerUserWithCognito).toHaveBeenCalledWith({
      username: "Alice",
      email: "alice@example.com",
      password: "pass123",
      role: "child",
      nickname: "Dad"
    });
  });

  it("falls back to username when nickname is omitted", async () => {
    cognito.registerUserWithCognito.mockResolvedValue({
      username: "alice",
      email: "alice@example.com",
      role: "parent",
      displayName: "alice"
    });

    await registerWithAuth({
      username: "alice",
      email: "alice@example.com",
      password: "pass123",
      role: "parent"
    });

    expect(cognito.registerUserWithCognito).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: "alice"
      })
    );
  });

  it("maps duplicate email to 409", async () => {
    const err = new Error("Email already exists");
    err.name = "EmailAlreadyExistsException";
    cognito.registerUserWithCognito.mockRejectedValue(err);

    const result = await registerWithAuth({
      username: "alice",
      email: "alice@example.com",
      password: "pass123",
      role: "parent"
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toContain("Email already exists");
  });

  it("maps Cognito password policy failure to 400", async () => {
    const err = new Error("Password policy failure");
    err.name = "InvalidPasswordException";
    cognito.registerUserWithCognito.mockRejectedValue(err);

    const result = await registerWithAuth({
      username: "alice",
      email: "alice@example.com",
      password: "pass123",
      role: "parent"
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("Cognito policy");
  });
});
