const authRoutes = require("../routes/authRoutes");
const protectedRoutes = require("../routes/protectedRoutes");
const aiFairytaleRoutes = require("../routes/aiFairytaleRoutes");

function mountApi(app) {
  app.get("/health/auth", (req, res) => {
    return res.json({ status: "ok", service: "auth-mounted" });
  });

  app.use("/auth", authRoutes);
  app.use("/api", aiFairytaleRoutes);
  app.use("/", protectedRoutes);
}

module.exports = {
  mountApi
};
