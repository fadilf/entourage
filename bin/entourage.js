#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);

// Parse --port flag
let port = 5555;
const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  port = parseInt(args[portIdx + 1], 10);
}
// Also support -p
const pIdx = args.indexOf("-p");
if (pIdx !== -1 && args[pIdx + 1]) {
  port = parseInt(args[pIdx + 1], 10);
}

const packageDir = path.resolve(__dirname, "..");

// Check if .next build exists; if not, build first
const dotNextDir = path.join(packageDir, ".next");
if (!fs.existsSync(dotNextDir)) {
  console.log("Building Entourage (first run)...");
  execSync("npx next build", { cwd: packageDir, stdio: "inherit" });
}

console.log(`Starting Entourage on http://localhost:${port}`);

const child = spawn("npx", ["next", "start", "-p", String(port)], {
  cwd: packageDir,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

// Forward signals
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
