const authRoutes = require("../routes/authRoutes");
const protectedRoutes = require("../routes/protectedRoutes");

function mountV2Api(app) {
  app.get("/health/auth-v2", (req, res) => {
    return res.json({ status: "ok", service: "auth-v2-mounted" });
  });

  app.use("/auth", authRoutes);
  app.use("/", protectedRoutes);
}

module.exports = {
  mountV2Api
};
