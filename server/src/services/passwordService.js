const {
  sendForgotPasswordCode,
  confirmForgotPassword
} = require("../auth/cognitoService");
const { enforceCognitoOnlyForLogin } = require("./phaseAPolicyService");
const projectPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d).{6,64}$/;

function mapPasswordError(error) {
  const code = error.name || error.Code || "";
  const message = error.message || "";
  if (code === "UserNotFoundException") {
    return { status: 404, message: "User does not exist" };
  }
  if (code === "CodeMismatchException") {
    return { status: 400, message: "Verification code is invalid" };
  }
  if (code === "ExpiredCodeException") {
    return { status: 400, message: "Verification code has expired" };
  }
  if (code === "InvalidPasswordException") {
    return {
      status: 400,
      message:
        "New password does not satisfy policy. Use at least 6 characters with at least one letter and one number. Uppercase and symbols are allowed but not required. If Cognito is stricter, update your User Pool password policy."
    };
  }
  if (
    code === "CredentialsProviderError" ||
    message.includes("Could not load credentials")
  ) {
    return {
      status: 500,
      message:
        "AWS credentials are missing on this machine. Configure AWS CLI credentials before password reset operations."
    };
  }
  return null;
}

async function requestPasswordReset(payload) {
  const policy = enforceCognitoOnlyForLogin();
  if (!policy.ok) {
    return policy;
  }

  const principal = payload && (payload.username || payload.email);
  if (!principal) {
    return { ok: false, status: 400, error: "Username or email is required" };
  }

  try {
    await sendForgotPasswordCode(principal);
    return {
      ok: true,
      status: 200,
      data: {
        message:
          "Password reset email/code has been sent by Cognito. Use the code to confirm your new password."
      }
    };
  } catch (error) {
    const mapped = mapPasswordError(error);
    if (mapped) {
      return { ok: false, status: mapped.status, error: mapped.message };
    }
    return { ok: false, status: 500, error: error.message };
  }
}

async function confirmPasswordReset(payload) {
  const policy = enforceCognitoOnlyForLogin();
  if (!policy.ok) {
    return policy;
  }

  const principal = payload && (payload.username || payload.email);
  const code = payload && payload.code;
  const newPassword = payload && payload.newPassword;

  if (!principal || !code || !newPassword) {
    return {
      ok: false,
      status: 400,
      error: "Username/email, code, and newPassword are required"
    };
  }

  if (!projectPasswordPattern.test(String(newPassword))) {
    return {
      ok: false,
      status: 400,
      error:
        "New password must be 6-64 characters with at least one letter and one number. Uppercase and symbols are optional."
    };
  }

  try {
    await confirmForgotPassword(principal, code, newPassword);
    return {
      ok: true,
      status: 200,
      data: { message: "Password has been reset successfully" }
    };
  } catch (error) {
    const mapped = mapPasswordError(error);
    if (mapped) {
      return { ok: false, status: mapped.status, error: mapped.message };
    }
    return { ok: false, status: 500, error: error.message };
  }
}

module.exports = {
  requestPasswordReset,
  confirmPasswordReset
};
