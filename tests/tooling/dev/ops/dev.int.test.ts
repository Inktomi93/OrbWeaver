// `pnpm dev` driven for real: the launcher runs in a scratch cwd (its own `.env`, db and data dir) on two
// free ports, boots the real server and vite, and must stop both on a SIGTERM aimed at the launcher alone.
// The launcher leads its own process group so a failed run is reaped by group, never by name.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { killPidGroup } from "@orb/tooling/_shared/proc";
import { processEnvValue } from "@orb/tooling/_shared/process-env";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BOOT_CEILING_MS = scaledBudget(120_000);
/** The launcher's own SIGKILL grace plus margin: a hung child must still end inside this. */
const STOP_CEILING_MS = scaledBudget(45_000);
const LIFECYCLE_TIMEOUT_MS = BOOT_CEILING_MS + STOP_CEILING_MS + scaledBudget(15_000);
const REFUSAL_TIMEOUT_MS = scaledBudget(60_000);
const POLL_MS = 250;
const SIGTERM_EXIT = 143;
const VIOLATIONS_EXIT = 1;
const STACK_FRAME_RE = /^\s+at /mu;

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (address === null || typeof address === "string") {
    throw new Error("freePort: the probe listener has no TCP address");
  }
  return address.port;
}

async function portRefuses(port: number): Promise<boolean> {
  const socket = connect(port, "127.0.0.1");
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
      up = (await answers(`http://127.0.0.1:${serverPort}/healthz`)) && (await answers(`http://127.0.0.1:${vitePort}/`));
      if (!up) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    }
    expect(up, `both children must answer before the signal:\n${output()}`).toBe(true);

    // Through vite's proxy: the client reaches this launch's server, and no `.env` auth key means single-user.
    const config: unknown = await (await fetch(`http://127.0.0.1:${vitePort}/api/auth/config`)).json();
    expect(config).toMatchObject({ mode: "single-user" });

    process.kill(pid, "SIGTERM");
    expect(await exitOf(child, STOP_CEILING_MS), output()).toBe(SIGTERM_EXIT);
    expect(await portRefuses(serverPort), "the server must not outlive the launcher").toBe(true);
    expect(await portRefuses(vitePort), "vite must not outlive the launcher").toBe(true);
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
    expect(output()).toContain("OIDC_ISSUER");
    expect(output(), "a refusal is the named keys alone, never a stack").not.toMatch(STACK_FRAME_RE);
    expect(existsSync(join(scratch, "data")), "the server never booted, so it created no data dir").toBe(false);
    expect(await portRefuses(serverPort)).toBe(true);
    expect(await portRefuses(vitePort)).toBe(true);
  } finally {
    killPidGroup(pid, "SIGKILL");
  }
});
