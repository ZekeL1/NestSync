jest.mock("../../src/auth/cognitoService", () => ({
  loginWithCognito: jest.fn(),
  resolveCognitoUsername: jest.fn()
}));

jest.mock("../../src/auth/tokenService", () => ({
  verifyToken: jest.fn()
}));

jest.mock("../../src/services/phaseAPolicyService", () => ({
  enforceCognitoOnlyForLogin: jest.fn()
}));

const { loginWithAuth } = require("../../src/services/loginService");
const cognitoService = require("../../src/auth/cognitoService");
const tokenService = require("../../src/auth/tokenService");
const phaseAPolicyService = require("../../src/services/phaseAPolicyService");

describe("loginService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    phaseAPolicyService.enforceCognitoOnlyForLogin.mockReturnValue({ ok: true });
    cognitoService.resolveCognitoUsername.mockImplementation(async (principal) => principal);
  });

  it("returns 400 when principal is missing", async () => {
    const result = await loginWithAuth("", "pass123");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("required");
    expect(cognitoService.loginWithCognito).not.toHaveBeenCalled();
  });

  it("returns 400 when password is missing", async () => {
    const result = await loginWithAuth("alice", "");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(cognitoService.loginWithCognito).not.toHaveBeenCalled();
  });

  it("returns policy error before contacting Cognito", async () => {
    phaseAPolicyService.enforceCognitoOnlyForLogin.mockReturnValue({
      ok: false,
      status: 503,
      error: "Cloud auth policy unavailable"
    });

    const result = await loginWithAuth("alice", "pass123");

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "Cloud auth policy unavailable"
    });
    expect(cognitoService.resolveCognitoUsername).not.toHaveBeenCalled();
  });

  it("logs in successfully with resolved Cognito username", async () => {
    cognitoService.resolveCognitoUsername.mockResolvedValue("resolved-alice");
    cognitoService.loginWithCognito.mockResolvedValue({
      idToken: "id-token",
      accessToken: "access-token",
      refreshToken: "refresh-token"
    });
    tokenService.verifyToken.mockResolvedValue({
      userId: "user-1",
      username: "alice",
      email: "alice@example.com",
      role: "parent",
      displayName: "Alice"
    });

    const result = await loginWithAuth("alice@example.com", "pass123");

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(cognitoService.resolveCognitoUsername).toHaveBeenCalledWith("alice@example.com");
    expect(cognitoService.loginWithCognito).toHaveBeenCalledWith("resolved-alice", "pass123");
    expect(tokenService.verifyToken).toHaveBeenCalledWith("id-token");
    expect(result.data).toEqual({
      accessToken: "id-token",
      providerTokens: {
        idToken: "id-token",
        accessToken: "access-token",
        refreshToken: "refresh-token"
      },
      user: {
        id: "user-1",
        username: "alice",
        email: "alice@example.com",
        role: "parent",
        displayName: "Alice"
      }
    });
  });

  it("returns 403 when verified token has no role", async () => {
    cognitoService.loginWithCognito.mockResolvedValue({ idToken: "id-token" });
    tokenService.verifyToken.mockResolvedValue({
      userId: "user-1",
      username: "alice",
      email: "alice@example.com",
      role: null,
      displayName: "Alice"
    });

    const result = await loginWithAuth("alice", "pass123");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain("Role is missing");
  });

  it("maps NotAuthorizedException to 401", async () => {
    const err = new Error("Bad credentials");
    err.name = "NotAuthorizedException";
    cognitoService.loginWithCognito.mockRejectedValue(err);

    const result = await loginWithAuth("alice", "wrong");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toContain("Invalid credentials");
  });

  it("maps UserNotConfirmedException to 403", async () => {
    const err = new Error("Unconfirmed");
    err.name = "UserNotConfirmedException";
    cognitoService.loginWithCognito.mockRejectedValue(err);

    const result = await loginWithAuth("alice", "pass123");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain("not confirmed");
  });

  it("maps PasswordResetRequiredException to 403", async () => {
    const err = new Error("Reset required");
    err.name = "PasswordResetRequiredException";
    cognitoService.loginWithCognito.mockRejectedValue(err);

    const result = await loginWithAuth("alice", "pass123");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain("Password reset is required");
  });

  it("maps credential provider failure to 500", async () => {
    const err = new Error("Could not load credentials from any providers");
    err.name = "CredentialsProviderError";
    cognitoService.loginWithCognito.mockRejectedValue(err);

    const result = await loginWithAuth("alice", "pass123");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toContain("AWS credentials");
  });

  it("returns raw error message for unexpected failures", async () => {
    cognitoService.loginWithCognito.mockRejectedValue(new Error("boom"));

    const result = await loginWithAuth("alice", "pass123");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toBe("boom");
  });
});
