const authRoutes = require("../routes/authRoutes");
const protectedRoutes = require("../routes/protectedRoutes");

function mountApi(app) {
  app.get("/health/auth", (req, res) => {
    return res.json({ status: "ok", service: "auth-mounted" });
  });

  app.use("/auth", authRoutes);
  app.use("/", protectedRoutes);
}

module.exports = {
  mountApi
};
