const express = require("express");
const { config } = require("../config");
const { findDevUserByCredentials } = require("../auth/devUsers");
const { issueDevAccessToken, verifyAccessToken } = require("../auth/tokenService");
const { loginWithCognito } = require("../auth/cognitoService");

const router = express.Router();

function mapCognitoErrorToHttp(error) {
  const code = error.name || error.Code || "";
  if (code === "NotAuthorizedException" || code === "UserNotFoundException") {
    return { status: 401, message: "Invalid credentials" };
  }
  if (code === "UserNotConfirmedException") {
    return {
      status: 403,
      message: "User is not confirmed in Cognito. Complete email/phone verification first."
    };
  }
  if (code === "PasswordResetRequiredException") {
    return {
      status: 403,
      message: "Password reset is required before sign-in."
    };
  }
  return null;
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (config.authMode === "cognito") {
      const cognitoTokens = await loginWithCognito(email, password);
      const identity = await verifyAccessToken(cognitoTokens.idToken);

      if (!identity.role) {
        return res.status(403).json({
          error:
            "Role is missing in Cognito token. Set custom:role or Cognito group for this user."
        });
      }

      return res.json({
        accessToken: cognitoTokens.idToken,
        providerTokens: cognitoTokens,
        user: {
          id: identity.userId,
          email: identity.email,
          role: identity.role,
          displayName: identity.displayName
        }
      });
    }

    if (config.authMode !== "dev") {
      return res.status(500).json({ error: "Unsupported auth mode" });
    }

    const user = findDevUserByCredentials(email, password);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = issueDevAccessToken(user);
    return res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName
      }
    });
  } catch (error) {
    const mapped = mapCognitoErrorToHttp(error);
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.message });
    }
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
