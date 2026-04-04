const path = require("path");
const { spawn } = require("child_process");
const { getFreePort, requestJson, waitForHealthy } = require("../helpers/httpTestUtils");

describe("system: server bootstrap", () => {
  let child;
  let stdout = "";
  let stderr = "";

  async function stopChildProcess() {
    if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
      child = null;
      return;
    }

    await new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
    });
    child = null;
  }

  afterEach(async () => {
    await stopChildProcess();
    stdout = "";
    stderr = "";
  });

  it("starts the real entrypoint and serves health endpoints", async () => {
    const port = await getFreePort();
    const rootDir = path.join(__dirname, "../..");

    child = spawn(process.execPath, ["server.js"], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(port),
        ROOM_STORE: "memory"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("exit", (code) => {
      if (code !== 0 && code !== null) {
        stderr += `\nprocess exited early with code ${code}`;
      }
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHealthy(baseUrl);

    const healthzResponse = await requestJson(baseUrl, "/healthz");
    expect(healthzResponse.status).toBe(200);
    expect(healthzResponse.json).toEqual({ status: "ok" });

    const authHealthResponse = await requestJson(baseUrl, "/health/auth");
    expect(authHealthResponse.status).toBe(200);
    expect(authHealthResponse.json).toEqual({
      status: "ok",
      service: "auth-mounted"
    });

    expect(stderr).toBe("");
    expect(stdout).toContain(`http://localhost:${port}`);
  });
});
