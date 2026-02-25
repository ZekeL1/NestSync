const { registerUserWithCognito } = require("../auth/cognitoService");
const { enforceCognitoOnlyForRegister } = require("./phaseAPolicyService");

const allowedRoles = new Set(["parent", "child"]);

function mapCognitoRegisterError(error) {
  const code = error.name || error.Code || "";
  const message = error.message || "";
  if (code === "UsernameExistsException") {
    return { status: 409, message: "Username already exists" };
  }
  if (code === "InvalidPasswordException") {
    return { status: 400, message: "Password does not satisfy Cognito policy" };
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

async function registerWithAuthV2(payload) {
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
    return {
      ok: false,
      status: 400,
      error: "Role must be either parent or child"
    };
  }

  try {
    const user = await registerUserWithCognito({
      username,
      email,
      password,
      role,
      nickname
    });

    return {
      ok: true,
      status: 201,
      data: {
        message: "User registered in Cognito successfully",
        user
      }
    };
  } catch (error) {
    const mapped = mapCognitoRegisterError(error);
    if (mapped) {
      return { ok: false, status: mapped.status, error: mapped.message };
    }
    return { ok: false, status: 500, error: error.message };
  }
}

module.exports = {
  registerWithAuthV2
};
