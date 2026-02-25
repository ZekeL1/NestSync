const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand
} = require("@aws-sdk/client-cognito-identity-provider");
const { config } = require("../config");

let cognitoClient;

function getCognitoClient() {
  if (!config.cognitoRegion) {
    throw new Error("COGNITO_REGION must be configured");
  }

  if (!cognitoClient) {
    cognitoClient = new CognitoIdentityProviderClient({ region: config.cognitoRegion });
  }
  return cognitoClient;
}

async function loginWithCognito(usernameOrEmail, password) {
  if (!config.cognitoAppClientId) {
    throw new Error("COGNITO_APP_CLIENT_ID must be configured");
  }

  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: config.cognitoAppClientId,
    AuthParameters: {
      USERNAME: usernameOrEmail,
      PASSWORD: password
    }
  });

  const response = await getCognitoClient().send(command);
  const authResult = response.AuthenticationResult;
  if (!authResult || !authResult.IdToken) {
    throw new Error(
      "Cognito did not return IdToken. Ensure USER_PASSWORD_AUTH is enabled."
    );
  }

  return {
    idToken: authResult.IdToken,
    accessToken: authResult.AccessToken || null,
    refreshToken: authResult.RefreshToken || null,
    expiresIn: authResult.ExpiresIn || null,
    tokenType: authResult.TokenType || "Bearer"
  };
}

async function registerUserWithCognito({ username, email, password, role, nickname }) {
  if (!config.cognitoUserPoolId) {
    throw new Error("COGNITO_USER_POOL_ID must be configured");
  }
  if (!config.cognitoAppClientId) {
    throw new Error("COGNITO_APP_CLIENT_ID must be configured");
  }

  const createCommand = new AdminCreateUserCommand({
    UserPoolId: config.cognitoUserPoolId,
    Username: username,
    TemporaryPassword: password,
    MessageAction: "SUPPRESS",
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "true" },
      { Name: "name", Value: nickname || username },
      { Name: "custom:role", Value: role }
    ]
  });

  await getCognitoClient().send(createCommand);

  const setPasswordCommand = new AdminSetUserPasswordCommand({
    UserPoolId: config.cognitoUserPoolId,
    Username: username,
    Password: password,
    Permanent: true
  });
  await getCognitoClient().send(setPasswordCommand);

  const addGroupCommand = new AdminAddUserToGroupCommand({
    UserPoolId: config.cognitoUserPoolId,
    Username: username,
    GroupName: role
  });
  await getCognitoClient().send(addGroupCommand);

  return {
    username,
    email,
    role,
    displayName: nickname || username
  };
}

module.exports = {
  loginWithCognito,
  registerUserWithCognito
};
