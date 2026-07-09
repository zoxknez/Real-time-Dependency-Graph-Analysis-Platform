import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(scriptDir, "..");
const port = process.env.E2E_PORT || "3100";
const managedBaseURL = `http://127.0.0.1:${port}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || managedBaseURL;
const shouldStartServer = !process.env.PLAYWRIGHT_BASE_URL;
const playwrightArgs = process.argv.slice(2);
const logDir = join(frontendRoot, ".next");
const stdoutLog = join(logDir, "e2e-server.stdout.log");
const stderrLog = join(logDir, "e2e-server.stderr.log");

let serverProcess;
let stoppingServer = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }

    child.once("exit", resolve);
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function startServer() {
  mkdirSync(logDir, { recursive: true });

  const nextBin = join(frontendRoot, "node_modules", "next", "dist", "bin", "next");
  const args = [
    nextBin,
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ];

  const child = spawn(process.execPath, args, {
    cwd: frontendRoot,
    env: {
      ...process.env,
      NEXT_DISABLE_TURBOPACK: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.pipe(createWriteStream(stdoutLog, { flags: "w" }));
  child.stderr.pipe(createWriteStream(stderrLog, { flags: "w" }));

  child.once("exit", (code, signal) => {
    if (stoppingServer) {
      return;
    }

    if (code !== null && code !== 0) {
      console.error(`Next dev server exited early with code ${code}. See ${stderrLog}`);
    } else if (signal) {
      console.error(`Next dev server stopped with signal ${signal}.`);
    }
  });

  return child;
}

function runPlaywright() {
  const playwrightCli = join(frontendRoot, "node_modules", "@playwright", "test", "cli.js");
  const child = spawn(process.execPath, [playwrightCli, "test", ...playwrightArgs], {
    cwd: frontendRoot,
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
    },
    stdio: "inherit",
  });

  return new Promise((resolve) => {
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }

  stoppingServer = true;
  serverProcess.kill();

  const forceKill = setTimeout(() => {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill("SIGKILL");
    }
  }, 5_000);

  await waitForExit(serverProcess);
  clearTimeout(forceKill);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await stopServer();
    process.exit(130);
  });
}

try {
  if (shouldStartServer) {
    serverProcess = startServer();
    await waitForServer(baseURL);
  }

  const exitCode = await runPlaywright();
  await stopServer();
  process.exit(exitCode);
} catch (error) {
  await stopServer();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
