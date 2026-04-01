const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const serverEnvPath = path.join(__dirname, "..", ".env");
const legacyV2EnvPath = path.join(__dirname, "..", "v2", ".env");

if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else if (fs.existsSync(legacyV2EnvPath)) {
  dotenv.config({ path: legacyV2EnvPath });
}

const config = {
  authMode: process.env.AUTH_MODE || "cognito",
  cognitoRegion: process.env.COGNITO_REGION || "",
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || "",
  cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID || "",
  cognitoIssuer: process.env.COGNITO_ISSUER || "",
  dynamoRoomsTable: process.env.DYNAMODB_ROOMS_TABLE || "",
  dynamoMessagesTable: process.env.DYNAMODB_MESSAGES_TABLE || "",
  roomStoreBackend: process.env.ROOM_STORE || "auto",
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
};

module.exports = {
  config
};
