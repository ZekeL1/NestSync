describe("tokenService", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadService({
    configOverrides = {},
    jwtVerifyImpl
  } = {}) {
    const createRemoteJWKSet = jest.fn(() => "jwks-handle");
    const jwtVerify = jest.fn(jwtVerifyImpl);

    jest.doMock("jose", () => ({
      createRemoteJWKSet,
      jwtVerify
    }));
    jest.doMock("../../src/config", () => ({
      config: {
        cognitoIssuer: "https://issuer.example.com",
        cognitoAppClientId: "client-123",
        ...configOverrides
      }
    }));

    const service = require("../../src/auth/tokenService");
    return { service, createRemoteJWKSet, jwtVerify };
  }

  it("throws when issuer is not configured", async () => {
    const { service } = loadService({
      configOverrides: { cognitoIssuer: "" },
      jwtVerifyImpl: async () => ({ payload: {} })
    });

    await expect(service.verifyToken("token")).rejects.toThrow("COGNITO_ISSUER must be configured");
  });

  it("verifies ID tokens, maps identity fields, and caches JWKS", async () => {
    const payload = {
      token_use: "id",
      aud: "client-123",
      sub: "user-1",
      email: "kid@example.com",
      "cognito:username": "kid-user",
      "custom:role": "child",
      name: "Kid User"
    };

    const { service, createRemoteJWKSet, jwtVerify } = loadService({
      jwtVerifyImpl: async () => ({ payload })
    });

    const first = await service.verifyToken("token-a");
    const second = await service.verifyToken("token-b");

    expect(first).toEqual({
      userId: "user-1",
      username: "kid-user",
      email: "kid@example.com",
      role: "child",
      displayName: "Kid User",
      raw: payload
    });
    expect(second.userId).toBe("user-1");
    expect(createRemoteJWKSet).toHaveBeenCalledTimes(1);
    expect(jwtVerify).toHaveBeenNthCalledWith(1, "token-a", "jwks-handle", {
      issuer: "https://issuer.example.com"
    });
  });

  it("uses Cognito group as role fallback for access tokens", async () => {
    const { service } = loadService({
      jwtVerifyImpl: async () => ({
        payload: {
          token_use: "access",
          client_id: "client-123",
          sub: "user-2",
          email: "parent@example.com",
          "cognito:groups": ["parent"]
        }
      })
    });

    await expect(service.verifyToken("access-token")).resolves.toMatchObject({
      userId: "user-2",
      role: "parent",
      displayName: "parent@example.com"
    });
  });

  it("rejects invalid audiences and unsupported token types", async () => {
    let loaded = loadService({
      jwtVerifyImpl: async () => ({
        payload: {
          token_use: "id",
          aud: "wrong-client"
        }
      })
    });
    await expect(loaded.service.verifyToken("bad-id")).rejects.toThrow("Invalid Cognito ID token audience");

    jest.resetModules();
    loaded = loadService({
      jwtVerifyImpl: async () => ({
        payload: {
          token_use: "access",
          client_id: "wrong-client"
        }
      })
    });
    await expect(loaded.service.verifyToken("bad-access")).rejects.toThrow("Invalid Cognito access token client_id");

    jest.resetModules();
    loaded = loadService({
      jwtVerifyImpl: async () => ({
        payload: {
          token_use: "refresh"
        }
      })
    });
    await expect(loaded.service.verifyToken("bad-kind")).rejects.toThrow("Unsupported Cognito token type");
  });
});
