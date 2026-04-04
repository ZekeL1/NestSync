describe("cognitoService", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadService(configOverrides = {}) {
    const send = jest.fn();
    const clientCtor = jest.fn(() => ({ send }));

    function commandMock(name) {
      return jest.fn(function Command(input) {
        this.input = input;
        this.name = name;
      });
    }

    const ListUsersCommand = commandMock("ListUsersCommand");
    const InitiateAuthCommand = commandMock("InitiateAuthCommand");
    const AdminCreateUserCommand = commandMock("AdminCreateUserCommand");
    const AdminSetUserPasswordCommand = commandMock("AdminSetUserPasswordCommand");
    const AdminAddUserToGroupCommand = commandMock("AdminAddUserToGroupCommand");
    const AdminUpdateUserAttributesCommand = commandMock("AdminUpdateUserAttributesCommand");
    const ForgotPasswordCommand = commandMock("ForgotPasswordCommand");
    const ConfirmForgotPasswordCommand = commandMock("ConfirmForgotPasswordCommand");

    jest.doMock("../../src/config", () => ({
      config: {
        cognitoRegion: "us-east-2",
        cognitoUserPoolId: "pool-123",
        cognitoAppClientId: "client-456",
        ...configOverrides
      }
    }));
    jest.doMock("@aws-sdk/client-cognito-identity-provider", () => ({
      CognitoIdentityProviderClient: clientCtor,
      InitiateAuthCommand,
      AdminCreateUserCommand,
      AdminSetUserPasswordCommand,
      AdminAddUserToGroupCommand,
      AdminUpdateUserAttributesCommand,
      ListUsersCommand,
      ForgotPasswordCommand,
      ConfirmForgotPasswordCommand
    }));

    const service = require("../../src/auth/cognitoService");
    return {
      service,
      send,
      clientCtor,
      ListUsersCommand,
      InitiateAuthCommand,
      AdminCreateUserCommand,
      AdminSetUserPasswordCommand,
      AdminAddUserToGroupCommand,
      AdminUpdateUserAttributesCommand,
      ForgotPasswordCommand,
      ConfirmForgotPasswordCommand
    };
  }

  it("resolves usernames directly for non-email inputs and blanks", async () => {
    const { service } = loadService();

    await expect(service.resolveCognitoUsername("kid-user")).resolves.toBe("kid-user");
    await expect(service.resolveCognitoUsername("   ")).resolves.toBe("");
  });

  it("looks up usernames by email and escapes filter values", async () => {
    const loaded = loadService();
    loaded.send.mockResolvedValueOnce({
      Users: [{ Username: "resolved-user" }]
    });

    const resolved = await loaded.service.resolveCognitoUsername('kid"test@example.com');

    expect(resolved).toBe("resolved-user");
    expect(loaded.ListUsersCommand.mock.instances[0].input).toEqual({
      UserPoolId: "pool-123",
      Filter: 'email = "kid\\"test@example.com"',
      Limit: 2
    });
    expect(loaded.clientCtor).toHaveBeenCalledWith({ region: "us-east-2" });
  });

  it("returns tokens from loginWithCognito and validates IdToken presence", async () => {
    let loaded = loadService();
    loaded.send.mockResolvedValueOnce({
      AuthenticationResult: {
        IdToken: "id-token",
        AccessToken: "access-token",
        RefreshToken: "refresh-token",
        ExpiresIn: 3600,
        TokenType: "Bearer"
      }
    });

    await expect(loaded.service.loginWithCognito("user", "pw")).resolves.toEqual({
      idToken: "id-token",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer"
    });

    expect(loaded.InitiateAuthCommand.mock.instances[0].input).toEqual({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "client-456",
      AuthParameters: {
        USERNAME: "user",
        PASSWORD: "pw"
      }
    });

    jest.resetModules();
    loaded = loadService();
    loaded.send.mockResolvedValueOnce({ AuthenticationResult: {} });
    await expect(loaded.service.loginWithCognito("user", "pw")).rejects.toThrow(
      "Cognito did not return IdToken. Ensure USER_PASSWORD_AUTH is enabled."
    );
  });

  it("registers users after duplicate-email checks", async () => {
    const loaded = loadService();
    loaded.send
      .mockResolvedValueOnce({ Users: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(
      loaded.service.registerUserWithCognito({
        username: "kid-user",
        email: "kid@example.com",
        password: "pass123",
        role: "child",
        nickname: "Kid"
      })
    ).resolves.toEqual({
      username: "kid-user",
      email: "kid@example.com",
      role: "child",
      displayName: "Kid"
    });

    expect(loaded.AdminCreateUserCommand.mock.instances[0].input.UserAttributes).toEqual([
      { Name: "email", Value: "kid@example.com" },
      { Name: "email_verified", Value: "true" },
      { Name: "name", Value: "Kid" },
      { Name: "custom:role", Value: "child" }
    ]);
    expect(loaded.AdminSetUserPasswordCommand.mock.instances[0].input.Permanent).toBe(true);
    expect(loaded.AdminAddUserToGroupCommand.mock.instances[0].input.GroupName).toBe("child");
  });

  it("rejects duplicate emails during registration", async () => {
    const loaded = loadService();
    loaded.send.mockResolvedValueOnce({
      Users: [{ Username: "existing-user" }]
    });

    await expect(
      loaded.service.registerUserWithCognito({
        username: "kid-user",
        email: "kid@example.com",
        password: "pass123",
        role: "child",
        nickname: "Kid"
      })
    ).rejects.toMatchObject({
      name: "EmailAlreadyExistsException",
      message: "Email already exists"
    });
  });

  it("falls back to raw principal for forgot-password and confirm-password flows", async () => {
    const loaded = loadService();
    loaded.send
      .mockResolvedValueOnce({ Users: [{ Username: "resolved-user" }] })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("not found"), { name: "UserNotFoundException" }))
      .mockResolvedValueOnce({ CodeDeliveryDetails: { Destination: "email" } });

    await loaded.service.sendForgotPasswordCode("kid@example.com");

    expect(loaded.ForgotPasswordCommand.mock.instances[0].input).toEqual({
      ClientId: "client-456",
      Username: "resolved-user"
    });
    expect(loaded.ForgotPasswordCommand.mock.instances[1].input).toEqual({
      ClientId: "client-456",
      Username: "kid@example.com"
    });

    jest.resetModules();
    const loadedConfirm = loadService();
    loadedConfirm.send
      .mockResolvedValueOnce({ Users: [{ Username: "resolved-user" }] })
      .mockRejectedValueOnce(Object.assign(new Error("bad user"), { name: "InvalidParameterException" }))
      .mockResolvedValueOnce({});

    await loadedConfirm.service.confirmForgotPassword("kid@example.com", "123456", "newPass1");

    expect(loadedConfirm.ConfirmForgotPasswordCommand.mock.instances[0].input).toEqual({
      ClientId: "client-456",
      Username: "resolved-user",
      ConfirmationCode: "123456",
      Password: "newPass1"
    });
    expect(loadedConfirm.ConfirmForgotPasswordCommand.mock.instances[1].input).toEqual({
      ClientId: "client-456",
      Username: "kid@example.com",
      ConfirmationCode: "123456",
      Password: "newPass1"
    });
  });
});
