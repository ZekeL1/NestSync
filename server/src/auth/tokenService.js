const { createRemoteJWKSet, jwtVerify } = require("jose");
const { config } = require("../config");

let jwks;

function getJwks() {
  if (!config.cognitoIssuer) {
    throw new Error("COGNITO_ISSUER must be configured");
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${config.cognitoIssuer}/.well-known/jwks.json`));
  }
  return jwks;
}

async function verifyCognitoToken(token) {
  if (!config.cognitoIssuer) {
    throw new Error("COGNITO_ISSUER must be configured");
  }

  const { payload } = await jwtVerify(token, getJwks(), { issuer: config.cognitoIssuer });

  if (payload.token_use === "id") {
    if (config.cognitoAppClientId && payload.aud !== config.cognitoAppClientId) {
      throw new Error("Invalid Cognito ID token audience");
    }
  } else if (payload.token_use === "access") {
    if (config.cognitoAppClientId && payload.client_id !== config.cognitoAppClientId) {
      throw new Error("Invalid Cognito access token client_id");
    }
  } else {
    throw new Error("Unsupported Cognito token type");
  }

  const roleFromGroup = Array.isArray(payload["cognito:groups"])
    ? payload["cognito:groups"][0]
    : null;

  return {
    userId: payload.sub,
    username: payload["cognito:username"] || payload.email || null,
    email: payload.email || null,
    role: payload["custom:role"] || roleFromGroup || null,
    displayName: payload.name || payload.email || payload["cognito:username"] || null,
    raw: payload
  };
}

async function verifyToken(token) {
  return verifyCognitoToken(token);
}

module.exports = {
  verifyToken
};
