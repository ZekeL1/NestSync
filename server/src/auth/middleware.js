const { verifyToken } = require("./tokenService");

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

    const identity = await verifyToken(token);
    if (!identity.role) {
      return res.status(403).json({ error: "Role is missing in token" });
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
    if (!req.auth || !allowed.has(req.auth.role)) {
      return res.status(403).json({
        error: "Forbidden for current role",
        requiredRoles: roles,
        currentRole: req.auth ? req.auth.role : null
      });
    }
    return next();
  };
}

module.exports = {
  extractBearerToken,
  authenticateToken,
  authorizeRoles
};
