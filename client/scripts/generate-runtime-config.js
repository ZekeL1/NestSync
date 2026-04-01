const fs = require("fs");
const path = require("path");

const apiBase = String(process.env.NESTSYNC_API_BASE || "").trim().replace(/\/+$/, "");
const outputPath = path.join(__dirname, "..", "runtime-config.js");

const content = `window.NESTSYNC_API_BASE = ${JSON.stringify(apiBase)};\n`;
fs.writeFileSync(outputPath, content, "utf8");

console.log(`[runtime-config] Wrote ${outputPath}`);
console.log(`[runtime-config] NESTSYNC_API_BASE=${apiBase || "<empty>"}`);
