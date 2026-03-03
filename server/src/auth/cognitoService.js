const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand
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

function escapeFilterValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findUserByEmail(email) {
  if (!config.cognitoUserPoolId) {
    throw new Error("COGNITO_USER_POOL_ID must be configured");
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const command = new ListUsersCommand({
    UserPoolId: config.cognitoUserPoolId,
    Filter: `email = "${escapeFilterValue(normalizedEmail)}"`,
    Limit: 2
  });

  const response = await getCognitoClient().send(command);
  const users = response.Users || [];
  return users[0] || null;
}

async function resolveCognitoUsername(principal) {
  const raw = String(principal || "").trim();
  if (!raw) {
    return "";
  }

  if (!raw.includes("@")) {
    return raw;
  }

  const user = await findUserByEmail(raw);
  if (!user || !user.Username) {
    return raw;
  }

  return user.Username;
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

  const existingUserByEmail = await findUserByEmail(email);
  if (existingUserByEmail) {
    const duplicateEmailError = new Error("Email already exists");
    duplicateEmailError.name = "EmailAlreadyExistsException";
    throw duplicateEmailError;
  }

  const createCommand = new AdminCreateUserCommand({
    UserPoolId: config.cognitoUserPoolId,
    Username: username,
    TemporaryPassword: password,
    DesiredDeliveryMediums: ["EMAIL"],
    UserAttributes: [
      { Name: "email", Value: String(email).trim().toLowerCase() },
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

async function ensureEmailVerified(username) {
  if (!config.cognitoUserPoolId || !username) return;
  try {
    await getCognitoClient().send(new AdminUpdateUserAttributesCommand({
      UserPoolId: config.cognitoUserPoolId,
      Username: username,
      UserAttributes: [{ Name: "email_verified", Value: "true" }]
    }));
  } catch (_) {
    /* ignore - user may not exist or attr update may fail; ForgotPassword will surface real errors */
  }
}

async function sendForgotPasswordCode(usernameOrEmail) {
  if (!config.cognitoAppClientId) {
    throw new Error("COGNITO_APP_CLIENT_ID must be configured");
  }

  const resolvedUsername = await resolveCognitoUsername(usernameOrEmail);
  await ensureEmailVerified(resolvedUsername);
  const command = new ForgotPasswordCommand({
    ClientId: config.cognitoAppClientId,
    Username: resolvedUsername
  });

  try {
    return await getCognitoClient().send(command);
  } catch (error) {
    const code = error.name || error.Code || "";
    const raw = String(usernameOrEmail || "").trim();
    if ((code === "UserNotFoundException" || code === "InvalidParameterException") && raw !== resolvedUsername) {
      const fallbackCommand = new ForgotPasswordCommand({
        ClientId: config.cognitoAppClientId,
        Username: raw
      });
      return getCognitoClient().send(fallbackCommand);
    }
    throw error;
  }
}

async function confirmForgotPassword(usernameOrEmail, code, newPassword) {
  if (!config.cognitoAppClientId) {
    throw new Error("COGNITO_APP_CLIENT_ID must be configured");
  }

  const resolvedUsername = await resolveCognitoUsername(usernameOrEmail);
  const command = new ConfirmForgotPasswordCommand({
    ClientId: config.cognitoAppClientId,
    Username: resolvedUsername,
    ConfirmationCode: code,
    Password: newPassword
  });

  try {
    return await getCognitoClient().send(command);
  } catch (error) {
    const codeName = error.name || error.Code || "";
    const raw = String(usernameOrEmail || "").trim();
    if ((codeName === "UserNotFoundException" || codeName === "InvalidParameterException") && raw !== resolvedUsername) {
      const fallbackCommand = new ConfirmForgotPasswordCommand({
        ClientId: config.cognitoAppClientId,
        Username: raw,
        ConfirmationCode: code,
        Password: newPassword
      });
      return getCognitoClient().send(fallbackCommand);
    }
    throw error;
  }
}

module.exports = {
  loginWithCognito,
  registerUserWithCognito,
  sendForgotPasswordCode,
  confirmForgotPassword,
  resolveCognitoUsername
};
