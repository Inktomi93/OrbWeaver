import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { killPidGroup } from "@orb/tooling/_shared/proc";
import { SERVER_ENTRY_IN_PACKAGE, SERVER_ENTRY_REL, SERVER_NODE_FLAGS } from "@orb/tooling/_shared/server-entry";
import { serverSpawnPlan } from "../../../tooling/src/dev/index.ts";
import { buildProdSpawnPlan } from "../../../tooling/src/stack/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// Every launcher runs the one server entry. A moved entry must fail here, not in whichever launcher nobody ran.

test("the server entry exists in this checkout", ({ repoRoot }) => {
  expect(existsSync(join(repoRoot, SERVER_ENTRY_REL))).toBe(true);
});

function devPlan(repoRoot: string): ReturnType<typeof serverSpawnPlan> {
  return serverSpawnPlan({
    nodePath: "node",
    server: { name: "@orb/server", dir: join(repoRoot, "packages", "server"), workspaceDeps: [] },
    watchRoots: [],
    cwd: repoRoot,
    env: {},
  });
}

test("pnpm start and pnpm dev both spawn that one file", ({ repoRoot }) => {
  const entry = join(repoRoot, SERVER_ENTRY_REL);
  const prod = buildProdSpawnPlan({ repoRoot, nodePath: "node", baseEnv: {}, logPath: join(repoRoot, "prod.log") });
  expect(prod.args).toEqual([...SERVER_NODE_FLAGS, entry]);
  expect(devPlan(repoRoot).args.at(-1)).toBe(entry);
  expect(entry.endsWith(SERVER_ENTRY_IN_PACKAGE)).toBe(true);
});

// Node prints one of these when SIGUSR1 opens the inspector, the second when its port is already taken.
const INSPECTOR_OPENED = /Debugger listening|Starting inspector/u;
const STAND_IN = "process.stdout.write(`ready ${process.pid}\\n`); setInterval(() => undefined, 1000);";
const SIGNAL_WINDOW_BASE_MS = 1500;
const SIGNAL_WINDOW_MS = scaledBudget(SIGNAL_WINDOW_BASE_MS);
const LAUNCHES_BASE_MS = 30_000;

interface Launch {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

// Starts a launcher's shape with a stand-in for the entry, signals every process that prints ready (the `--watch`
// parent and its child alike), and reports whether any of them opened an inspector.
async function opensInspectorOnSigusr1(launch: Launch, standIn: string): Promise<boolean> {
  const child: ChildProcess = spawn(process.execPath, [...launch.args, standIn], {
    // biome-ignore lint/style/noProcessEnv: the launch keeps PATH; the shape under test adds only its own keys.
    env: { ["PATH"]: process.env["PATH"] ?? "", ...launch.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  try {
    while (!stdout.includes("ready")) {
      if (child.exitCode !== null) {
        throw new Error(`test: the stand-in exited early\n${stderr}`);
      }
      await sleep(20);
    }
    const pids = new Set([child.pid, ...[...stdout.matchAll(/ready (\d+)/gu)].map((match) => Number(match[1]))]);
    for (const pid of pids) {
      if (pid !== undefined) {
        process.kill(pid, "SIGUSR1");
      }
    }
    for (let waited = 0; waited < SIGNAL_WINDOW_MS && !INSPECTOR_OPENED.test(stderr); waited += 50) {
      await sleep(50);
    }
    expect(child.exitCode, "SIGUSR1 must not end the app").toBeNull();
    return INSPECTOR_OPENED.test(stderr);
  } finally {
    killPidGroup(child.pid, "SIGKILL");
  }
}

function dockerfileNodeOptions(repoRoot: string): string {
  const value = /^ENV NODE_OPTIONS=(.+)$/mu.exec(readFileSync(join(repoRoot, "Dockerfile"), "utf8"))?.[1];
  if (value === undefined) {
    throw new Error("test: the Dockerfile sets no NODE_OPTIONS");
  }
  return value;
}

test.skipIf(process.platform === "win32")(
  "no launcher's server opens its inspector on SIGUSR1",
  { timeout: scaledBudget(LAUNCHES_BASE_MS) },
  async ({ repoRoot, scratch }) => {
    const standIn = join(scratch, "stand-in.mjs");
    writeFileSync(standIn, STAND_IN);
    const prod = buildProdSpawnPlan({ repoRoot, nodePath: "node", baseEnv: {}, logPath: join(scratch, "prod.log") });
    const launches: Readonly<Record<string, Launch>> = {
      "pnpm start": { args: prod.args.slice(0, -1), env: {} },
      "pnpm dev": { args: devPlan(repoRoot).args.slice(0, -1), env: {} },
      image: { args: [], env: { ["NODE_OPTIONS"]: dockerfileNodeOptions(repoRoot) } },
    };
    // The control proves the observable: a bare node opens its inspector on the same signal.
    expect(await opensInspectorOnSigusr1({ args: [], env: {} }, standIn)).toBe(true);
    const opened: Record<string, boolean> = {};
    for (const [name, launch] of Object.entries(launches)) {
      opened[name] = await opensInspectorOnSigusr1(launch, standIn);
    }
    expect(opened).toEqual({ "pnpm start": false, "pnpm dev": false, image: false });
  },
);
