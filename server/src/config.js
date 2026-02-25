const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const config = {
  port: Number(process.env.PORT || 3000),
  authMode: process.env.AUTH_MODE || "dev",
  devJwtSecret: process.env.DEV_JWT_SECRET || "change-this-in-env",
  devTokenExpiresIn: process.env.DEV_TOKEN_EXPIRES_IN || "2h",
  cognitoRegion: process.env.COGNITO_REGION || "",
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || "",
  cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID || "",
  cognitoIssuer: process.env.COGNITO_ISSUER || ""
};

function assertSupportedAuthMode() {
  const supported = new Set(["dev", "cognito"]);
  if (!supported.has(config.authMode)) {
    throw new Error(`Unsupported AUTH_MODE: ${config.authMode}`);
  }
}

module.exports = {
  config,
  assertSupportedAuthMode
};
