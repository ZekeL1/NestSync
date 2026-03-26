"use strict";

(() => {
  const form = document.getElementById("ai-tales-form");
  const promptInput = document.getElementById("ai-tales-prompt");
  const output = document.getElementById("ai-tales-output");
  const modelBadge = document.getElementById("ai-tales-model-badge");
  const generateButton = document.getElementById("ai-tales-generate");

  if (!form || !promptInput || !output || !generateButton || !modelBadge) {
    return;
  }

  const placeholderHtml = '<p class="ai-tales-placeholder">Your own lovely story is coming here!</p>';

  function setPending(pending) {
    generateButton.disabled = pending;
    generateButton.innerHTML = pending
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Generating...'
      : '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Story';
  }

  function setModelBadge(modelName) {
    const resolvedName = String(modelName || "").trim() || "unknown";
    modelBadge.textContent = `Local LLM: ${resolvedName}`;
  }

  function renderStory(storyText) {
    if (!storyText) {
      output.innerHTML = placeholderHtml;
      return;
    }
    output.textContent = storyText;
  }

  function renderError(message) {
    output.innerHTML = "";
    const p = document.createElement("p");
    p.className = "ai-tales-placeholder";
    p.style.color = "#d63031";
    p.style.fontStyle = "normal";
    p.textContent = message;
    output.appendChild(p);
  }

  async function requestStory(prompt) {
    const response = await fetch("/api/ai-fairytale/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload.error || payload.message || `Story generation failed (${response.status}).`);
    }

    return payload;
  }

  async function requestModelInfo() {
    const response = await fetch("/api/ai-fairytale/model");
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && payload.model ? payload.model : null;
  }

  requestModelInfo()
    .then((modelName) => {
      if (modelName) setModelBadge(modelName);
    })
    .catch(() => {});

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = promptInput.value.trim();

    if (!prompt) {
      renderError("Please enter your story request first.");
      return;
    }

    setPending(true);

    try {
      const data = await requestStory(prompt);
      renderStory(data.story || "");
      if (data.model) setModelBadge(data.model);
    } catch (error) {
      renderError(error.message || "Generation failed.");
    } finally {
      setPending(false);
    }
  });
})();
