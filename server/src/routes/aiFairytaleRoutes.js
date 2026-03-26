const express = require("express");
const { generateStoryWithOfflineModel } = require("../services/offlineStoryService");

const router = express.Router();

router.get("/ai-fairytale/model", (req, res) => {
  const model = process.env.AI_STORY_MODEL || "phi3:mini";
  return res.json({ ok: true, model });
});

router.post("/ai-fairytale/generate", async (req, res) => {
  const prompt = req.body && typeof req.body.prompt === "string" ? req.body.prompt : "";
  if (!prompt.trim()) {
    return res.status(400).json({ ok: false, error: "Prompt is required." });
  }

  try {
    const result = await generateStoryWithOfflineModel(prompt);
    return res.json({
      ok: true,
      story: result.story,
      model: result.model
    });
  } catch (error) {
    const status = Number(error.status) || 503;
    const baseMessage = error.message || "Local story generation failed.";
    const hint =
      "Make sure local Ollama is running and model is available (example: ollama pull phi3:mini).";
    return res.status(status).json({
      ok: false,
      error: `${baseMessage} ${hint}`
    });
  }
});

module.exports = router;
