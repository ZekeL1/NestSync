const {
  requestPasswordReset,
  confirmPasswordReset
} = require("../src/services/passwordService");

jest.mock("../src/auth/cognitoService", () => ({
  sendForgotPasswordCode: jest.fn(),
  confirmForgotPassword: jest.fn()
}));

const cognitoService = require("../src/auth/cognitoService");

describe("passwordService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("requestPasswordReset", () => {
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
  });

  describe("confirmPasswordReset", () => {
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
  });
});
