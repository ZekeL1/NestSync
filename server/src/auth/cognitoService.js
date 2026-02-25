const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} = require("@aws-sdk/client-cognito-identity-provider");
const { config } = require("../config");

let cognitoClient;

function getCognitoClient() {
  if (!config.cognitoRegion) {
    throw new Error("COGNITO_REGION must be provided in cognito mode");
  }

  if (!cognitoClient) {
    cognitoClient = new CognitoIdentityProviderClient({
      region: config.cognitoRegion
    });
  }
  return cognitoClient;
}

async function loginWithCognito(email, password) {
  if (!config.cognitoAppClientId) {
    throw new Error("COGNITO_APP_CLIENT_ID must be provided in cognito mode");
  }

  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: config.cognitoAppClientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password
    }
  });

  const response = await getCognitoClient().send(command);
  const authResult = response.AuthenticationResult;
  if (!authResult || !authResult.IdToken) {
    throw new Error(
      "Cognito did not return IdToken. Ensure USER_PASSWORD_AUTH is enabled for this app client."
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

module.exports = {
  loginWithCognito
};
