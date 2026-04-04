const http = require("http");
const net = require("net");

async function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const { port } = httpServer.address();
      resolve({
        httpServer,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            httpServer.close((error) => {
              if (error) return closeReject(error);
              return closeResolve();
            });
          })
      });
    });
    httpServer.once("error", reject);
  });
}

async function requestJson(baseUrl, pathname, options = {}) {
  const url = new URL(pathname, baseUrl);
  const body =
    options.body === undefined || typeof options.body === "string"
      ? options.body
      : JSON.stringify(options.body);
  const headers = { ...(options.headers || {}) };

  if (body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: options.method || "GET",
        headers
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let json = null;
          if (raw) {
            try {
              json = JSON.parse(raw);
            } catch (error) {
              return reject(error);
            }
          }
          return resolve({
            status: res.statusCode,
            headers: res.headers,
            json,
            text: raw
          });
        });
      }
    );

    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => {
        if (error) return reject(error);
        return resolve(port);
      });
    });
    server.once("error", reject);
  });
}

async function waitForHealthy(baseUrl, pathname = "/healthz", timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await requestJson(baseUrl, pathname);
      if (response.status === 200) {
        return response;
      }
    } catch (error) {
      // Ignore transient connection failures while the server is booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${pathname} on ${baseUrl}`);
}

module.exports = {
  getFreePort,
  listen,
  requestJson,
  waitForHealthy
};
