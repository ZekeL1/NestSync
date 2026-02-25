const jwt = require("jsonwebtoken");
const { createRemoteJWKSet, jwtVerify } = require("jose");
const { config } = require("../config");

let jwks;

function issueDevAccessToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.displayName
  };

  return jwt.sign(payload, config.devJwtSecret, {
    algorithm: "HS256",
    expiresIn: config.devTokenExpiresIn
  });
}

async function verifyDevAccessToken(token) {
  const decoded = jwt.verify(token, config.devJwtSecret, {
    algorithms: ["HS256"]
  });

  return {
    userId: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    displayName: decoded.name,
    raw: decoded
  };
}

function getCognitoJwks() {
  if (!jwks) {
    if (!config.cognitoIssuer) {
      throw new Error("COGNITO_ISSUER must be provided in cognito mode");
    }
    const jwksUrl = new URL(`${config.cognitoIssuer}/.well-known/jwks.json`);
    jwks = createRemoteJWKSet(jwksUrl);
  }
  return jwks;
}

async function verifyCognitoAccessToken(token) {
  if (!config.cognitoIssuer) {
    throw new Error("COGNITO_ISSUER must be provided in cognito mode");
  }

  const { payload } = await jwtVerify(token, getCognitoJwks(), {
    issuer: config.cognitoIssuer
  });

  const tokenUse = payload.token_use;
  if (tokenUse === "id") {
    if (config.cognitoAppClientId && payload.aud !== config.cognitoAppClientId) {
      throw new Error("Cognito ID token audience is invalid");
    }
  } else if (tokenUse === "access") {
    if (
      config.cognitoAppClientId &&
      payload.client_id !== config.cognitoAppClientId
    ) {
      throw new Error("Cognito access token client_id is invalid");
    }
  } else {
    throw new Error("Unsupported Cognito token type");
  }

  const roleFromGroup = Array.isArray(payload["cognito:groups"])
    ? payload["cognito:groups"][0]
    : undefined;

  return {
    userId: payload.sub,
    email: payload.email,
    role: payload["custom:role"] || roleFromGroup || null,
    displayName: payload.name || payload.email,
    raw: payload
  };
}

async function verifyAccessToken(token) {
  if (config.authMode === "dev") {
    return verifyDevAccessToken(token);
  }
  return verifyCognitoAccessToken(token);
}

module.exports = {
  issueDevAccessToken,
  verifyAccessToken
};
