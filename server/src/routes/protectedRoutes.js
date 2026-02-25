const express = require("express");
const { authenticateToken, authorizeRoles } = require("../auth/middleware");

const router = express.Router();

router.get("/me", authenticateToken, (req, res) => {
  return res.json({
    userId: req.auth.userId,
    email: req.auth.email,
    role: req.auth.role,
    displayName: req.auth.displayName
  });
});

router.post(
  "/features/control-playback",
  authenticateToken,
  authorizeRoles("parent"),
  (req, res) => {
    return res.json({
      ok: true,
      action: "control-playback",
      message: "Playback control accepted for parent role."
    });
  }
);

router.post(
  "/features/open-games",
  authenticateToken,
  authorizeRoles("parent", "child"),
  (req, res) => {
    return res.json({
      ok: true,
      action: "open-games",
      message: "Mini-games access granted."
    });
  }
);

router.post(
  "/features/open-fairy-tales",
  authenticateToken,
  authorizeRoles("parent", "child"),
  (req, res) => {
    return res.json({
      ok: true,
      action: "open-fairy-tales",
      message: "Fairy tales access granted."
    });
  }
);

module.exports = router;
