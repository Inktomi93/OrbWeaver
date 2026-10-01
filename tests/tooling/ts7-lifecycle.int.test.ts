import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { HOST_POOL_ROOT_ENV, hostPoolDir, tryAcquireHostSlot } from "@orb/tooling/_shared/host-slots";
import { processInfo } from "@orb/tooling/_shared/platform";
import { killPidGroup } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { TS7_POOL_NAME } from "@orb/tooling/_shared/ts7-admission";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const TIMEOUT = scaledBudget(15_000);

function live(pid: number): boolean {
  const info = processInfo(pid);
  return info !== null && info.cmdline !== "";
}

function startWrapper(
  root: string,
  scratch: string,
  abruptParent = false,
): { readonly child: ReturnType<typeof spawn>; readonly exited: Promise<number | null>; readonly pool: string } {
  mkdirSync(join(scratch, "runtime"), { recursive: true });
  const env = inheritedProcessEnv({ [HOST_POOL_ROOT_ENV]: join(scratch, "runtime") });
  const compiler = join(scratch, "compiler.cjs");
  const descendant = join(scratch, "descendant.cjs");
  const preload = join(scratch, "preload.cjs");
  writeFileSync(descendant, "setInterval(() => {}, 1000);");
  writeFileSync(
    compiler,
    `const {spawn}=require("node:child_process"); const {writeFileSync}=require("node:fs");
const child=spawn(process.execPath,[${JSON.stringify(descendant)}],{stdio:"inherit"});
writeFileSync(${JSON.stringify(join(scratch, "pids.json"))},JSON.stringify([process.pid,child.pid]));
`,
  );
  writeFileSync(
    preload,
    `const cp=require("node:child_process");const original=cp.spawn;
cp.spawn=(command,args,options)=>original(command,[${JSON.stringify(compiler)}],options);
require("node:module").syncBuiltinESMExports();`,
  );
  const wrapperArgs = ["--require", preload, join(root, "scripts", "ts7.ts"), "--noEmit", "-p", "tsconfig.json"];
  const parent = join(scratch, "parent.cjs");
  writeFileSync(
    parent,
    `const {spawn}=require("node:child_process");const {writeFileSync}=require("node:fs");
const wrapper=spawn(process.execPath,${JSON.stringify(wrapperArgs)},{cwd:${JSON.stringify(root)},stdio:["ignore","inherit","inherit","ipc"],detached:process.platform!=="win32"});
writeFileSync(${JSON.stringify(join(scratch, "wrapper-pid.json"))},JSON.stringify(wrapper.pid));
setInterval(()=>{},1000);
`,
  );
  const child = spawn(process.execPath, abruptParent ? [parent] : wrapperArgs, {
    cwd: root,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout?.resume();
  child.stderr?.resume();
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  return { child, exited, pool: hostPoolDir({ name: TS7_POOL_NAME, slots: 1, label: "" }, env) };
}

test("disconnecting the dev parent terminates the compiler descendants and releases its host lease", { timeout: TIMEOUT }, async ({ repoRoot, scratch }) => {
  const { child, exited, pool } = startWrapper(repoRoot, scratch);
  try {
    await expect.poll(() => existsSync(join(scratch, "pids.json"))).toBe(true);
    const pids = JSON.parse(readFileSync(join(scratch, "pids.json"), "utf8")) as number[];
    expect(pids).toHaveLength(2);
    expect(pids.every(live)).toBe(true);
    expect(readdirSync(pool).filter((name) => name.endsWith(".lock"))).toHaveLength(1);
    child.disconnect();
    expect(await exited).toBe(70);
    await expect.poll(() => pids.some(live)).toBe(false);
    expect(readdirSync(pool).filter((name) => name.endsWith(".lock"))).toEqual([]);
    expect(readdirSync(join(pool, "queue"))).toEqual([]);
  } finally {
    if (child.connected) {
      child.disconnect();
    }
    await exited;
  }
});

test("disconnect while queued removes its ticket and starts no compiler", { timeout: TIMEOUT }, async ({ repoRoot, scratch }) => {
  const runtime = join(scratch, "runtime");
  mkdirSync(runtime);
  const env = { [HOST_POOL_ROOT_ENV]: runtime };
  const slots = readConcurrencyProfile().ts7RunnersHostWide;
  const leases = Array.from({ length: slots }, () => tryAcquireHostSlot({ name: TS7_POOL_NAME, slots, label: "occupied" }, { env }));
  const { child, exited, pool } = startWrapper(repoRoot, scratch);
  try {
    await expect.poll(() => readdirSync(join(pool, "queue")).length).toBe(1);
    child.disconnect();
    expect(await exited).toBe(70);
    expect(existsSync(join(scratch, "pids.json"))).toBe(false);
    expect(readdirSync(join(pool, "queue"))).toEqual([]);
    expect(readdirSync(pool).filter((name) => name.endsWith(".lock"))).toHaveLength(slots);
  } finally {
    if (child.connected) {
      child.disconnect();
    }
    await exited;
    for (const lease of leases) {
      lease?.release();
    }
  }
});

test("an abruptly killed dev process leaves no detached native compiler or host lease", { timeout: TIMEOUT }, async ({ repoRoot, scratch }) => {
  const { child, exited, pool } = startWrapper(repoRoot, scratch, true);
  try {
    await expect.poll(() => existsSync(join(scratch, "pids.json"))).toBe(true);
    const compilerPids = JSON.parse(readFileSync(join(scratch, "pids.json"), "utf8")) as number[];
    const wrapperPid = JSON.parse(readFileSync(join(scratch, "wrapper-pid.json"), "utf8")) as number;
    expect([...compilerPids, wrapperPid].every(live)).toBe(true);
    killPidGroup(child.pid, "SIGKILL");
    await exited;
    await expect.poll(() => [...compilerPids, wrapperPid].some(live)).toBe(false);
    const released = tryAcquireHostSlot(
      { name: TS7_POOL_NAME, slots: 1, label: "after parent exit" },
      { env: { [HOST_POOL_ROOT_ENV]: join(scratch, "runtime") } },
    );
    try {
      expect(released, "a dead process must not retain admission").not.toBeNull();
    } finally {
      released?.release();
    }
    expect(readdirSync(pool).filter((name) => name.endsWith(".lock"))).toEqual([]);
  } finally {
    killPidGroup(child.pid, "SIGKILL");
    await exited;
  }
});
