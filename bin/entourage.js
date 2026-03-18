#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: entourage [options]

Options:
  -p, --port <number>  Port to serve on (default: 5555)
  -H, --host <address> Host to bind to (default: localhost)
  -h, --help           Show this help message`);
  process.exit(0);
}

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

// Parse --host / -H flag
let host = "localhost";
const hostIdx = args.indexOf("--host");
if (hostIdx !== -1 && args[hostIdx + 1]) {
  host = args[hostIdx + 1];
}
const hIdx = args.indexOf("-H");
if (hIdx !== -1 && args[hIdx + 1]) {
  host = args[hIdx + 1];
}

const packageDir = path.resolve(__dirname, "..");

// Check if .next build exists; if not, build first
const dotNextDir = path.join(packageDir, ".next");
if (!fs.existsSync(dotNextDir)) {
  console.log("Building Entourage (first run)...");
  execSync("npx next build", { cwd: packageDir, stdio: "inherit" });
}

console.log(`Starting Entourage on http://${host}:${port}`);

const child = spawn("npx", ["next", "start", "-p", String(port), "-H", host], {
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
