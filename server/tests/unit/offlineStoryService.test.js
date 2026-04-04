const { generateStoryWithOfflineModel } = require("../../src/services/offlineStoryService");

describe("offlineStoryService", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("rejects empty prompts", async () => {
    await expect(generateStoryWithOfflineModel("   ")).rejects.toMatchObject({
      status: 400,
      message: "Prompt is required."
    });
  });

  it("rejects when fetch is unavailable", async () => {
    global.fetch = undefined;

    await expect(generateStoryWithOfflineModel("Tell me a story")).rejects.toMatchObject({
      status: 500
    });
  });

  it("calls the offline model endpoint and returns story content", async () => {
    process.env.AI_STORY_MODEL = "tiny-story";
    process.env.AI_STORY_OLLAMA_URL = "http://ollama.local:11434///";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: "Moonlight Picnic\nOnce upon a time..."
      })
    });

    const result = await generateStoryWithOfflineModel("A dragon who loves tea");

    expect(result).toEqual({
      story: "Moonlight Picnic\nOnce upon a time...",
      model: "tiny-story"
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://ollama.local:11434/api/generate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
    );

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.prompt).toContain("A dragon who loves tea");
  });

  it("returns LLM response errors with status 503", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "model offline" })
    });

    await expect(generateStoryWithOfflineModel("Prompt")).rejects.toMatchObject({
      status: 503,
      message: "model offline"
    });
  });

  it("rejects empty model output and abort timeouts", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: "   " })
    });

    await expect(generateStoryWithOfflineModel("Prompt")).rejects.toMatchObject({
      status: 502,
      message: "Local model returned empty content."
    });

    global.fetch = jest.fn().mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );

    await expect(generateStoryWithOfflineModel("Prompt")).rejects.toMatchObject({
      status: 504,
      message: "Local model request timed out."
    });
  });
});
