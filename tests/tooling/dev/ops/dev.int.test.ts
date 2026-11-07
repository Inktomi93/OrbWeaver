// `pnpm dev` driven for real: the launcher runs in a scratch cwd (its own `.env`, db and data dir) on two
// free ports, boots the real server and vite, and must stop both on a SIGTERM aimed at the launcher alone.
// The launcher leads its own process group so a failed run is reaped by group, never by name.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { OIDC_ISSUER_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/tooling";
import { killPidGroup } from "@orb/tooling/floor/process/proc";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { builtClientLine } from "../../../../tooling/src/dev/index.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BOOT_CEILING_MS = scaledBudget(120_000);
/** The launcher's own SIGKILL grace plus margin: a hung child must still end inside this. */
const STOP_CEILING_MS = scaledBudget(45_000);
const LIFECYCLE_TIMEOUT_MS = BOOT_CEILING_MS + STOP_CEILING_MS + scaledBudget(15_000);
const REFUSAL_TIMEOUT_MS = scaledBudget(60_000);
const POLL_MS = 250;
const SIGTERM_EXIT = 143;
const VIOLATIONS_EXIT = 1;
const STACK_FRAME_RE = /^[ \t]+at /mu;
const VITE_HOST = "localhost";
const SERVER_HOST = "127.0.0.1";
const IPV6_LOOPBACK = "::1";

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, SERVER_HOST);
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (address === null || typeof address === "string") {
    throw new Error("freePort: the probe listener has no TCP address");
  }
  return address.port;
}

async function portRefuses(port: number, host: string): Promise<boolean> {
  const socket = connect(port, host);
  try {
    await once(socket, "connect");
    return false;
  } catch {
    return true;
  } finally {
    socket.destroy();
  }
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(POLL_MS * 8) })).ok;
  } catch {
    return false;
  }
}

/** Only what node needs, so no vitest switch (`ORB_ENV_NO_FILE`, `VITEST`) stops the server loading `.env`. */
function bareEnv(): Record<string, string> {
  return Object.fromEntries(
    ["PATH", "HOME"].flatMap((key) => {
      const value = processEnvValue(key);
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

function startLauncher(repoRoot: string, cwd: string): { readonly child: ChildProcess; readonly pid: number; readonly output: () => string } {
  const chunks: string[] = [];
  const child = spawn(process.execPath, [join(repoRoot, "tooling", "src", "dev", "cli.ts")], {
    cwd,
    env: bareEnv(),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // A missing pid would make every later signal land on this runner's own group.
  if (child.pid === undefined || child.pid <= 1) {
    throw new Error("startLauncher: the launcher did not get a usable pid");
  }
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  return { child, pid: child.pid, output: () => chunks.join("") };
}

test("the shutdown probe distinguishes an IPv6 listener from a refused IPv4 twin", async () => {
  const server = createServer();
  server.listen(0, IPV6_LOOPBACK);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("IPv6 control did not bind a TCP port");
  }
  try {
    expect(await portRefuses(address.port, SERVER_HOST)).toBe(true);
    expect(await portRefuses(address.port, IPV6_LOOPBACK)).toBe(false);
  } finally {
    server.close();
    await once(server, "close");
  }
  expect(await portRefuses(address.port, IPV6_LOOPBACK)).toBe(true);
});

async function exitOf(child: ChildProcess, ceilingMs: number): Promise<number | null | "timeout"> {
  if (child.exitCode !== null) {
    return child.exitCode;
  }
  return await Promise.race([
    once(child, "exit").then(([code]: unknown[]) => (typeof code === "number" ? code : null)),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ceilingMs)),
  ]);
}

test("a SIGTERM to the launcher stops the server and vite it started, and it exits 128+SIGTERM", { timeout: LIFECYCLE_TIMEOUT_MS }, async ({
  repoRoot,
  scratch,
}) => {
  const serverPort = await freePort();
  const vitePort = await freePort();
  // Both ports come only from `.env`: the launcher must read the file the way the server does.
  writeFileSync(join(scratch, ".env"), `PORT=${serverPort}\nVITE_PORT=${vitePort}\n`);
  const { child, pid, output } = startLauncher(repoRoot, scratch);
  try {
    const polls = Math.ceil(BOOT_CEILING_MS / POLL_MS);
    let up = false;
    for (let i = 0; i < polls && !up && child.exitCode === null; i += 1) {
      up = (await answers(`http://${SERVER_HOST}:${serverPort}/healthz`)) && (await answers(`http://${VITE_HOST}:${vitePort}/`));
      if (!up) {
        await sleep(POLL_MS);
      }
    }
    expect(up, `both children must answer before the signal:\n${output()}`).toBe(true);

    // Through vite's proxy: the client reaches this launch's server, and no `.env` auth key means single-user.
    const config: unknown = await (await fetch(`http://${VITE_HOST}:${vitePort}/api/auth/config`)).json();
    expect(config).toMatchObject({ mode: "single-user" });

    process.kill(pid, "SIGTERM");
    expect(await exitOf(child, STOP_CEILING_MS), output()).toBe(SIGTERM_EXIT);
    expect(await portRefuses(serverPort, SERVER_HOST), "the server must not outlive the launcher").toBe(true);
    expect(await portRefuses(vitePort, VITE_HOST), "vite must not outlive the launcher").toBe(true);
  } finally {
    killPidGroup(pid, "SIGKILL");
  }
});

test("a setting the server would refuse stops the launch before either child starts", { timeout: REFUSAL_TIMEOUT_MS }, async ({ repoRoot, scratch }) => {
  const serverPort = await freePort();
  const vitePort = await freePort();
  // oidc mode needs its issuer; the file names none.
  writeFileSync(join(scratch, ".env"), `AUTH_MODE=oidc\nPORT=${serverPort}\nVITE_PORT=${vitePort}\n`);
  const { child, pid, output } = startLauncher(repoRoot, scratch);
  try {
    expect(await exitOf(child, REFUSAL_TIMEOUT_MS), output()).toBe(VIOLATIONS_EXIT);
    expect(output()).toContain(OIDC_ISSUER_KEY);
    expect(output(), "a refusal is the named keys alone, never a stack").not.toMatch(STACK_FRAME_RE);
    expect(existsSync(join(scratch, "data")), "the server never booted, so it created no data dir").toBe(false);
    expect(await portRefuses(serverPort, SERVER_HOST)).toBe(true);
    expect(await portRefuses(vitePort, VITE_HOST)).toBe(true);
  } finally {
    killPidGroup(pid, "SIGKILL");
  }
});

async function waitFor(condition: () => Promise<boolean> | boolean, child: ChildProcess, ceilingMs: number): Promise<boolean> {
  const polls = Math.ceil(ceilingMs / POLL_MS);
  for (let i = 0; i < polls && child.exitCode === null; i += 1) {
    if (await condition()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return false;
}

test("a Playwright-owned stack that serves a built client starts the server and no vite", { timeout: LIFECYCLE_TIMEOUT_MS }, async ({ repoRoot, scratch }) => {
  const serverPort = await freePort();
  const vitePort = await freePort();
  const clientDir = join(scratch, "built-client");
  mkdirSync(clientDir);
  writeFileSync(join(clientDir, "index.html"), "<!doctype html><title>built</title>");
  writeFileSync(join(scratch, ".env"), `PORT=${serverPort}\nVITE_PORT=${vitePort}\nE2E_HARNESS=on\nCLIENT_DIST_DIR=${clientDir}\n`);
  const { child, pid, output } = startLauncher(repoRoot, scratch);
  try {
    // The launcher prints the line in the step that would have spawned vite, once the server answers.
    const decided = await waitFor(() => output().includes(builtClientLine(clientDir)), child, BOOT_CEILING_MS);
    expect(decided, `the launcher must decide against vite once the server is up:\n${output()}`).toBe(true);
    expect(await answers(`http://${SERVER_HOST}:${serverPort}/healthz`), "the server is the stack").toBe(true);
    expect(await answers(`http://${SERVER_HOST}:${serverPort}/`), "the server serves the built client itself").toBe(true);
    expect(await portRefuses(vitePort, VITE_HOST), "no vite binds the dev client port").toBe(true);
    expect(await portRefuses(vitePort, SERVER_HOST)).toBe(true);

    process.kill(pid, "SIGTERM");
    expect(await exitOf(child, STOP_CEILING_MS), output()).toBe(SIGTERM_EXIT);
    expect(await portRefuses(serverPort, SERVER_HOST), "the server must not outlive the launcher").toBe(true);
  } finally {
    killPidGroup(pid, "SIGKILL");
  }
});

test("a held vite port ends the launch with vite's refusal and the exit line, and stops the server", { timeout: LIFECYCLE_TIMEOUT_MS }, async ({
  repoRoot,
  scratch,
}) => {
  const serverPort = await freePort();
  const holder = createServer();
  // No host: the dual-stack wildcard holds the port whichever loopback address vite resolves `localhost` to.
  holder.listen(0);
  await once(holder, "listening");
  const held = holder.address();
  if (held === null || typeof held === "string") {
    throw new Error("the port holder has no TCP address");
  }
  writeFileSync(join(scratch, ".env"), `PORT=${serverPort}\nVITE_PORT=${held.port}\n`);
  const { child, pid, output } = startLauncher(repoRoot, scratch);
  try {
    expect(await exitOf(child, BOOT_CEILING_MS), output()).not.toBe("timeout");
    expect(output(), "vite's own refusal names the port").toContain(`Port ${String(held.port)} is already in use`);
    expect(output(), "the exit line names the child that went and the one it stops").toMatch(/dev: vite exited \(code \d+\); stopping server\./u);
    expect(await portRefuses(serverPort, SERVER_HOST), "the server must not outlive the launcher").toBe(true);
  } finally {
    killPidGroup(pid, "SIGKILL");
    holder.close();
    await once(holder, "close");
  }
});

const LINT_WORKER_TIMEOUT_RE = /Atomics\.wait|synckit/iu;

test("a lint worker that fails is reported while vite keeps serving", { timeout: LIFECYCLE_TIMEOUT_MS }, async ({ repoRoot, scratch }) => {
  const serverPort = await freePort();
  const vitePort = await freePort();
  // One millisecond is shorter than any sync worker round trip, so the Tailwind rule's first call times out as it does under box load.
  writeFileSync(join(scratch, ".env"), `PORT=${serverPort}\nVITE_PORT=${vitePort}\nSYNCKIT_TIMEOUT=1\n`);
  const { child, pid, output } = startLauncher(repoRoot, scratch);
  try {
    const failed = await waitFor(() => LINT_WORKER_TIMEOUT_RE.test(output()), child, BOOT_CEILING_MS);
    expect(failed, `the lint worker's failure must reach the log:\n${output()}`).toBe(true);
    // waitFor gives up the moment the launcher exits, so a vite that died with the worker never reads as serving.
    const serving = await waitFor(async () => await answers(`http://${VITE_HOST}:${vitePort}/`), child, BOOT_CEILING_MS);
    expect(serving, `vite must outlive the lint worker:\n${output()}`).toBe(true);
    expect(child.exitCode, "the launcher is still supervising").toBeNull();
    expect(await answers(`http://${SERVER_HOST}:${serverPort}/healthz`)).toBe(true);

    process.kill(pid, "SIGTERM");
    expect(await exitOf(child, STOP_CEILING_MS), output()).toBe(SIGTERM_EXIT);
  } finally {
    killPidGroup(pid, "SIGKILL");
  }
});
