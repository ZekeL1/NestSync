jest.mock("../../src/auth/tokenService", () => ({
  verifyToken: jest.fn()
}));

const { verifyToken } = require("../../src/auth/tokenService");
const {
  extractBearerToken,
  authenticateToken,
  authorizeRoles
} = require("../../src/auth/middleware");

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe("auth middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extractBearerToken parses bearer headers and rejects invalid input", () => {
    expect(extractBearerToken()).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer good-token")).toBe("good-token");
  });

  it("authenticateToken rejects missing bearer tokens", async () => {
    const req = { headers: {} };
    const res = createResponse();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing bearer token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("authenticateToken rejects identities without a role", async () => {
    verifyToken.mockResolvedValueOnce({ userId: "u-1", role: null });

    const req = { headers: { authorization: "Bearer roleless-token" } };
    const res = createResponse();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Role is missing in token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("authenticateToken returns token validation errors", async () => {
    verifyToken.mockRejectedValueOnce(new Error("bad token"));

    const req = { headers: { authorization: "Bearer broken-token" } };
    const res = createResponse();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: "Token validation failed",
      details: "bad token"
    });
  });

  it("authenticateToken attaches auth identity and calls next", async () => {
    verifyToken.mockResolvedValueOnce({ userId: "u-2", role: "parent" });

    const req = { headers: { authorization: "Bearer valid-token" } };
    const res = createResponse();
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(req.auth).toEqual({ userId: "u-2", role: "parent" });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  it("authorizeRoles allows matching roles and blocks others", () => {
    const reqAllowed = { auth: { role: "parent" } };
    const resAllowed = createResponse();
    const nextAllowed = jest.fn();

    authorizeRoles("parent", "child")(reqAllowed, resAllowed, nextAllowed);

    expect(nextAllowed).toHaveBeenCalledTimes(1);

    const reqBlocked = { auth: { role: "guest" } };
    const resBlocked = createResponse();
    const nextBlocked = jest.fn();

    authorizeRoles("parent", "child")(reqBlocked, resBlocked, nextBlocked);

    expect(resBlocked.statusCode).toBe(403);
    expect(resBlocked.body).toEqual({
      error: "Forbidden for current role",
      requiredRoles: ["parent", "child"],
      currentRole: "guest"
    });
    expect(nextBlocked).not.toHaveBeenCalled();
  });
});
