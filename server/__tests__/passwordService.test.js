const {
  requestPasswordReset,
  confirmPasswordReset
} = require("../src/services/passwordService");

jest.mock("../src/services/phaseAPolicyService", () => ({
  enforceCognitoOnlyForLogin: jest.fn()
}));

jest.mock("../src/auth/cognitoService", () => ({
  sendForgotPasswordCode: jest.fn(),
  confirmForgotPassword: jest.fn()
}));

const cognitoService = require("../src/auth/cognitoService");
const phaseAPolicyService = require("../src/services/phaseAPolicyService");

describe("passwordService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    phaseAPolicyService.enforceCognitoOnlyForLogin.mockReturnValue({ ok: true });
  });

  describe("requestPasswordReset", () => {
    it("returns policy error when Cognito login policy is unavailable", async () => {
      phaseAPolicyService.enforceCognitoOnlyForLogin.mockReturnValue({
        ok: false,
        status: 503,
        error: "Cloud auth policy unavailable"
      });

      const result = await requestPasswordReset({ email: "test@example.com" });

      expect(result).toEqual({
        ok: false,
        status: 503,
        error: "Cloud auth policy unavailable"
      });
      expect(cognitoService.sendForgotPasswordCode).not.toHaveBeenCalled();
    });

    it("returns 400 when username/email is missing", async () => {
      const result = await requestPasswordReset({});
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain("Username or email");
      expect(cognitoService.sendForgotPasswordCode).not.toHaveBeenCalled();
    });

    it("returns 400 when payload is null", async () => {
      const result = await requestPasswordReset(null);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it("calls Cognito and returns success when email provided", async () => {
      cognitoService.sendForgotPasswordCode.mockResolvedValue({});
      const result = await requestPasswordReset({ email: "test@example.com" });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data.message).toContain("sent");
      expect(cognitoService.sendForgotPasswordCode).toHaveBeenCalledWith("test@example.com");
    });

    it("calls Cognito when username provided", async () => {
      cognitoService.sendForgotPasswordCode.mockResolvedValue({});
      const result = await requestPasswordReset({ username: "alice" });
      expect(result.ok).toBe(true);
      expect(cognitoService.sendForgotPasswordCode).toHaveBeenCalledWith("alice");
    });

    it("maps UserNotFoundException to 404", async () => {
      const err = new Error("User not found");
      err.name = "UserNotFoundException";
      cognitoService.sendForgotPasswordCode.mockRejectedValue(err);
      const result = await requestPasswordReset({ email: "nobody@example.com" });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error).toContain("does not exist");
    });

    it("maps credential loading failure to 500", async () => {
      const err = new Error("Could not load credentials from any providers");
      err.name = "CredentialsProviderError";
      cognitoService.sendForgotPasswordCode.mockRejectedValue(err);

      const result = await requestPasswordReset({ username: "alice" });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(500);
      expect(result.error).toContain("AWS credentials");
    });
  });

  describe("confirmPasswordReset", () => {
    it("returns policy error before validating payload", async () => {
      phaseAPolicyService.enforceCognitoOnlyForLogin.mockReturnValue({
        ok: false,
        status: 503,
        error: "Cloud auth policy unavailable"
      });

      const result = await confirmPasswordReset({
        email: "test@example.com",
        code: "123456",
        newPassword: "pass123"
      });

      expect(result).toEqual({
        ok: false,
        status: 503,
        error: "Cloud auth policy unavailable"
      });
      expect(cognitoService.confirmForgotPassword).not.toHaveBeenCalled();
    });

    it("returns 400 when principal is missing", async () => {
      const result = await confirmPasswordReset({
        code: "123456",
        newPassword: "pass123"
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain("required");
      expect(cognitoService.confirmForgotPassword).not.toHaveBeenCalled();
    });

    it("returns 400 when code is missing", async () => {
      const result = await confirmPasswordReset({
        email: "test@example.com",
        newPassword: "pass123"
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it("returns 400 when newPassword is missing", async () => {
      const result = await confirmPasswordReset({
        email: "test@example.com",
        code: "123456"
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it("returns 400 when password too short", async () => {
      const result = await confirmPasswordReset({
        email: "test@example.com",
        code: "123456",
        newPassword: "abc12"
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain("6");
    });

    it("returns 400 when password has no number", async () => {
      const result = await confirmPasswordReset({
        email: "test@example.com",
        code: "123456",
        newPassword: "abcdef"
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it("returns 400 when password has no letter", async () => {
      const result = await confirmPasswordReset({
        email: "test@example.com",
        code: "123456",
        newPassword: "123456"
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it("accepts valid password and calls Cognito", async () => {
      cognitoService.confirmForgotPassword.mockResolvedValue({});
      const result = await confirmPasswordReset({
        email: "test@example.com",
        code: "123456",
        newPassword: "pass123"
      });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data.message).toContain("reset successfully");
      expect(cognitoService.confirmForgotPassword).toHaveBeenCalledWith(
        "test@example.com",
        "123456",
        "pass123"
      );
    });

    it("maps CodeMismatchException to 400", async () => {
      const err = new Error("Invalid code");
      err.name = "CodeMismatchException";
      cognitoService.confirmForgotPassword.mockRejectedValue(err);
      const result = await confirmPasswordReset({
        email: "test@example.com",
        code: "wrong",
        newPassword: "pass123"
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain("invalid");
    });

    it("maps ExpiredCodeException to 400", async () => {
      const err = new Error("Expired code");
      err.name = "ExpiredCodeException";
      cognitoService.confirmForgotPassword.mockRejectedValue(err);

      const result = await confirmPasswordReset({
        email: "test@example.com",
        code: "old-code",
        newPassword: "pass123"
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain("expired");
    });

    it("maps InvalidPasswordException from Cognito to 400", async () => {
      const err = new Error("Password policy failure");
      err.name = "InvalidPasswordException";
      cognitoService.confirmForgotPassword.mockRejectedValue(err);

      const result = await confirmPasswordReset({
        username: "alice",
        code: "123456",
        newPassword: "pass123"
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain("satisfy policy");
    });
  });
});
