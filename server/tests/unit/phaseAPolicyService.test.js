jest.mock("../../src/config", () => ({
  config: {
    authMode: "cognito",
    cognitoRegion: "us-east-2",
    cognitoUserPoolId: "pool-123",
    cognitoAppClientId: "client-456",
    cognitoIssuer: "https://cognito-idp.us-east-2.amazonaws.com/pool-123"
  }
}));

const { config } = require("../../src/config");
const {
  enforceCognitoOnlyForLogin,
  enforceCognitoOnlyForRegister
} = require("../../src/services/phaseAPolicyService");

describe("phaseAPolicyService", () => {
  afterEach(() => {
    config.authMode = "cognito";
    config.cognitoRegion = "us-east-2";
    config.cognitoUserPoolId = "pool-123";
    config.cognitoAppClientId = "client-456";
    config.cognitoIssuer = "https://cognito-idp.us-east-2.amazonaws.com/pool-123";
  });

  describe("enforceCognitoOnlyForLogin", () => {
    it("returns ok when Cognito is configured", () => {
      const result = enforceCognitoOnlyForLogin();
      expect(result.ok).toBe(true);
    });

    it("returns 503 when authMode is not cognito", () => {
      config.authMode = "local";
      const result = enforceCognitoOnlyForLogin();
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
      expect(result.error).toContain("AUTH_MODE");
    });

    it("returns 503 when cognitoRegion is missing", () => {
      config.cognitoRegion = "";
      const result = enforceCognitoOnlyForLogin();
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
      expect(result.error).toContain("COGNITO");
    });
  });

  describe("enforceCognitoOnlyForRegister", () => {
    it("returns ok when Cognito is configured", () => {
      const result = enforceCognitoOnlyForRegister();
      expect(result.ok).toBe(true);
    });

    it("returns 503 when authMode is not cognito", () => {
      config.authMode = "local";
      const result = enforceCognitoOnlyForRegister();
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
    });

    it("returns 503 when cognitoUserPoolId is missing", () => {
      config.cognitoUserPoolId = "";
      const result = enforceCognitoOnlyForRegister();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("COGNITO_USER_POOL_ID");
    });
  });
});
