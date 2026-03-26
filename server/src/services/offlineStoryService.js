function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

function buildStoryPrompt(userRequest) {
  return [
    "You are a creative fairy-tale storyteller for children and families.",
    "Write one complete short story in English based on the user's request.",
    "Requirements:",
    "- Keep it imaginative and coherent.",
    "- Keep tone family-friendly and avoid graphic violence.",
    "- Length around 220-380 words.",
    "- Include a title as the first line.",
    "",
    `User request: ${userRequest}`,
    "",
    "Story:"
  ].join("\n");
}

async function generateStoryWithOfflineModel(userRequest) {
  const prompt = String(userRequest || "").trim();
  if (!prompt) {
    const error = new Error("Prompt is required.");
    error.status = 400;
    throw error;
  }

  const model = process.env.AI_STORY_MODEL || "phi3:mini";
  const baseUrl = normalizeBaseUrl(process.env.AI_STORY_OLLAMA_URL);
  const timeoutMs = Number(process.env.AI_STORY_TIMEOUT_MS || 120000);

  if (typeof fetch !== "function") {
    const error = new Error("Runtime fetch API is unavailable. Please use Node.js 18+.");
    error.status = 500;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        prompt: buildStoryPrompt(prompt),
        options: {
          temperature: 0.85,
          top_p: 0.9
        }
      })
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      const message = payload.error || payload.message || `LLM request failed with status ${response.status}.`;
      const requestError = new Error(message);
      requestError.status = 503;
      throw requestError;
    }

    const story = String(payload.response || "").trim();
    if (!story) {
      const error = new Error("Local model returned empty content.");
      error.status = 502;
      throw error;
    }

    return {
      story,
      model
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Local model request timed out.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  generateStoryWithOfflineModel
};
