const { registerUserWithCognito } = require("../auth/cognitoService");
const { enforceCognitoOnlyForRegister } = require("./phaseAPolicyService");

const allowedRoles = new Set(["parent", "child"]);
const usernamePattern = /^[A-Za-z0-9_.-]{3,32}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const projectPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d).{6,64}$/;

function mapRegisterError(error) {
  const code = error.name || error.Code || "";
  const message = error.message || "";
  if (code === "UsernameExistsException") {
    return { status: 409, message: "Username already exists" };
  }
  if (code === "EmailAlreadyExistsException") {
    return { status: 409, message: "Email already exists. Use login or password reset." };
  }
  if (code === "InvalidPasswordException") {
    return {
      status: 400,
      message:
        "Password does not satisfy Cognito policy. For this project we require at least 6 characters with at least one letter and one number. Uppercase and symbols are allowed but not required. If Cognito is stricter, update your User Pool password policy."
    };
  }
  if (code === "InvalidParameterException") {
    return { status: 400, message: error.message || "Invalid registration parameters" };
  }
  if (
    code === "CredentialsProviderError" ||
    message.includes("Could not load credentials")
  ) {
    return {
      status: 500,
      message:
        "AWS credentials are missing on this machine. Configure AWS CLI credentials before registering users in Cognito."
    };
  }
  return null;
}

async function registerWithAuth(payload) {
  const policy = enforceCognitoOnlyForRegister();
  if (!policy.ok) {
    return policy;
  }

  const { username, email, password, role, nickname } = payload || {};
  if (!username || !email || !password || !role) {
    return {
      ok: false,
      status: 400,
      error: "Username, email, password, and role are required"
    };
  }

  if (!allowedRoles.has(role)) {
    return { ok: false, status: 400, error: "Role must be either parent or child" };
  }

  const normalizedUsername = String(username).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedNickname = String(nickname || normalizedUsername).trim();

  if (!usernamePattern.test(normalizedUsername)) {
    return {
      ok: false,
      status: 400,
      error:
        "Username must be 3-32 characters and can include letters, numbers, underscore, dot, or hyphen."
    };
  }

  if (!emailPattern.test(normalizedEmail)) {
    return { ok: false, status: 400, error: "Please enter a valid email address." };
  }

  if (!projectPasswordPattern.test(String(password || ""))) {
    return {
      ok: false,
      status: 400,
      error:
        "Password must be 6-64 characters with at least one letter and one number. Uppercase and symbols are optional."
    };
  }

  try {
    const user = await registerUserWithCognito({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      role,
      nickname: normalizedNickname
    });

    return {
      ok: true,
      status: 201,
      data: {
        message:
          "User registered in Cognito successfully. A Cognito email has been sent for account verification/invitation.",
        user
      }
    };
  } catch (error) {
    const mapped = mapRegisterError(error);
    if (mapped) {
      return { ok: false, status: mapped.status, error: mapped.message };
    }
    return { ok: false, status: 500, error: error.message };
  }
}

module.exports = {
  registerWithAuth
};
