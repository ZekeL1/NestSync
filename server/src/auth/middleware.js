const { verifyAccessToken } = require("./tokenService");

function extractBearerToken(authorization) {
  if (!authorization || typeof authorization !== "string") {
    return null;
  }
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

async function authenticateToken(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const identity = await verifyAccessToken(token);
    if (!identity.role) {
      return res.status(403).json({ error: "User role is missing in token" });
    }

    req.auth = identity;
    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Token validation failed",
      details: error.message
    });
  }
}

function authorizeRoles(...roles) {
  const allowed = new Set(roles);

  return (req, res, next) => {
    if (!req.auth || !req.auth.role) {
      return res.status(401).json({ error: "User is not authenticated" });
    }
    if (!allowed.has(req.auth.role)) {
      return res.status(403).json({
        error: "Forbidden for this role",
        requiredRoles: roles,
        currentRole: req.auth.role
      });
    }
    return next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  extractBearerToken
};
