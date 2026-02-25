const { config } = require("../config");

function validateCognitoConfig() {
  const missing = [];
  if (!config.cognitoRegion) {
    missing.push("COGNITO_REGION");
  }
  if (!config.cognitoUserPoolId) {
    missing.push("COGNITO_USER_POOL_ID");
  }
  if (!config.cognitoAppClientId) {
    missing.push("COGNITO_APP_CLIENT_ID");
  }
  if (!config.cognitoIssuer) {
    missing.push("COGNITO_ISSUER");
  }
  return missing;
}

function enforceCognitoOnlyForLogin() {
  if (config.authMode !== "cognito") {
    return {
      ok: false,
      status: 503,
      error:
        "Phase A policy: local login is disabled. Set AUTH_MODE=cognito and configure Cognito values in server/v2/.env."
    };
  }

  const missing = validateCognitoConfig();
  if (missing.length > 0) {
    return {
      ok: false,
      status: 503,
      error: `Phase A policy: missing Cognito config: ${missing.join(", ")}`
    };
  }

  return { ok: true };
}

function rejectLegacyRegisterResponse() {
  return {
    status: 410,
    body: {
      success: false,
      message:
        "Phase A policy: local registration is disabled. Use Cognito-managed user provisioning."
    }
  };
}

function enforceCognitoOnlyForRegister() {
  if (config.authMode !== "cognito") {
    return {
      ok: false,
      status: 503,
      error:
        "Phase A policy: register is Cognito-only. Set AUTH_MODE=cognito and configure Cognito values in server/v2/.env."
    };
  }

  const missing = validateCognitoConfig();
  if (missing.length > 0) {
    return {
      ok: false,
      status: 503,
      error: `Phase A policy: missing Cognito config: ${missing.join(", ")}`
    };
  }

  return { ok: true };
}

module.exports = {
  enforceCognitoOnlyForLogin,
  rejectLegacyRegisterResponse,
  enforceCognitoOnlyForRegister
};
