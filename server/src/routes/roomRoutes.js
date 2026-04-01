const express = require("express");
const { authenticateToken, authorizeRoles } = require("../auth/middleware");
const roomService = require("../services/roomService");

const router = express.Router();

router.post("/", authenticateToken, authorizeRoles("parent"), async (req, res) => {
  try {
    const { password } = req.body || {};
    const result = await roomService.createRoomForParent({
      parentUserId: req.auth.userId,
      passwordPlain: password
    });
    if (!result.ok) {
      return res.status(500).json({ success: false, message: result.error || "Create failed" });
    }
    return res.status(201).json({ success: true, roomId: result.roomId });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:roomId/join", authenticateToken, async (req, res) => {
  try {
    const { password } = req.body || {};
    const result = await roomService.validateRoomAccess({
      roomId: req.params.roomId,
      userId: req.auth.userId,
      role: req.auth.role,
      passwordPlain: password
    });
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        code: result.code,
        message: result.message
      });
    }
    return res.json({ success: true, roomId: result.room.roomId, status: result.room.status });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/:roomId/meta", authenticateToken, async (req, res) => {
  try {
    const meta = await roomService.getRoomMeta(req.params.roomId);
    return res.json(meta);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/:roomId/messages", authenticateToken, async (req, res) => {
  try {
    const check = await roomService.validateRoomAccess({
      roomId: req.params.roomId,
      userId: req.auth.userId,
      role: req.auth.role,
      passwordPlain: null
    });
    if (!check.ok) {
      return res.status(check.status).json({
        success: false,
        code: check.code,
        message: check.message
      });
    }
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const out = await roomService.getMessages(req.params.roomId, { limit });
    return res.json({ success: true, messages: out.items });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
