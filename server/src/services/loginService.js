const { verifyToken } = require("../auth/tokenService");
const { loginWithCognito, resolveCognitoUsername } = require("../auth/cognitoService");
const { enforceCognitoOnlyForLogin } = require("./phaseAPolicyService");

function mapCognitoError(error) {
  const code = error.name || error.Code || "";
  const message = error.message || "";
  if (code === "NotAuthorizedException" || code === "UserNotFoundException") {
    return {
      status: 401,
      message:
        "Invalid credentials or account not found. If you reset users recently, please register this account again."
    };
  }
  if (code === "UserNotConfirmedException") {
    return { status: 403, message: "User is not confirmed in Cognito" };
  }
  if (code === "PasswordResetRequiredException") {
    return { status: 403, message: "Password reset is required before sign-in" };
  }
  if (
    code === "CredentialsProviderError" ||
    message.includes("Could not load credentials")
  ) {
    return {
      status: 500,
      message:
        "AWS credentials are missing on this machine. Configure AWS CLI credentials before using Cognito endpoints."
    };
  }
  return null;
}

async function loginWithAuth(principal, password) {
  if (!principal || !password) {
    return {
      ok: false,
      status: 400,
      error: "Username/email and password are required"
    };
  }

  const policy = enforceCognitoOnlyForLogin();
  if (!policy.ok) {
    return policy;
  }

  try {
    const resolvedPrincipal = await resolveCognitoUsername(principal);
    const providerTokens = await loginWithCognito(resolvedPrincipal, password);
    const identity = await verifyToken(providerTokens.idToken);
    if (!identity.role) {
      return {
        ok: false,
        status: 403,
        error: "Role is missing in Cognito token. Set group or custom:role."
      };
    }

    return {
      ok: true,
      status: 200,
      data: {
        accessToken: providerTokens.idToken,
        providerTokens,
        user: {
          id: identity.userId,
          username: identity.username,
          email: identity.email,
          role: identity.role,
          displayName: identity.displayName
        }
      }
    };
  } catch (error) {
    const mapped = mapCognitoError(error);
    if (mapped) {
      return { ok: false, status: mapped.status, error: mapped.message };
    }
    return { ok: false, status: 500, error: error.message };
  }
}

module.exports = {
  loginWithAuth
};
