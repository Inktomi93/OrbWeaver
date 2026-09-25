// The whole-program typecheck host pool (tooling/src/_shared/ts7-admission.ts, 0176). Every input is
// injected: the pool root is a scratch runtime dir and the process table is faked, so no assertion depends on
// the host's own slots or on a live operator run.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import type { HostSlotLease } from "@orb/tooling/_shared/host-slots";
import { HOST_POOL_ROOT_ENV, hostPoolDir, tryAcquireHostSlot } from "@orb/tooling/_shared/host-slots";
import { admitTs7Run, buildsProgram, TS7_ADMISSION_ENV, TS7_POOL_NAME, ts7AdmissionModeFor, ts7SlotLabel } from "@orb/tooling/_shared/ts7-admission";
import { expect, test } from "../../support/tool-fixtures.ts";

function scratchEnv(mode?: string): NodeJS.ProcessEnv {
  return { [HOST_POOL_ROOT_ENV]: mkdtempSync(join(tmpdir(), "orb-ts7-admission-")), ...(mode === undefined ? {} : { [TS7_ADMISSION_ENV]: mode }) };
}

function aliveOnly(...pids: readonly number[]): (pid: number) => boolean {
  return (pid): boolean => pids.includes(pid);
}

const PROGRAM_ARGS = ["--noEmit", "-p", "tsconfig.json"] as const;

test("the admission switch queues by default, tries on request, and refuses anything else", () => {
  expect(ts7AdmissionModeFor(undefined)).toBe("queue");
  expect(ts7AdmissionModeFor("")).toBe("queue");
  expect(ts7AdmissionModeFor("queue")).toBe("queue");
  expect(ts7AdmissionModeFor(" try ")).toBe("try");
  for (const bogus of ["1", "true", "skip", "TRY"]) {
    expect(() => ts7AdmissionModeFor(bogus), bogus).toThrow(new RegExp(`${TS7_ADMISSION_ENV}="${bogus}"`, "u"));
  }
});

test("only a run that builds a program takes a slot", () => {
  expect(buildsProgram(PROGRAM_ARGS)).toBe(true);
  expect(buildsProgram(["--listFilesOnly", "-p", "tsconfig.json"]), "listing files still loads the program").toBe(true);
  for (const flag of ["--version", "-v", "--help", "-h", "--all", "--init", "--showConfig", "-V"]) {
    expect(buildsProgram([flag]), flag).toBe(false);
  }
});

test("the slot label names the program and the checkout", () => {
  expect(ts7SlotLabel(["--noEmit", "-p", "packages/server/tsconfig.json"], "/work/lane-a")).toBe("ts7 -p packages/server/tsconfig.json in lane-a");
  expect(ts7SlotLabel(["--project", "tsconfig.tests-dom.json"], "/work/main")).toBe("ts7 -p tsconfig.tests-dom.json in main");
  expect(ts7SlotLabel(["--noEmit"], "/work/main"), "tsc's own default program").toBe("ts7 -p tsconfig.json in main");
});

test("a run that builds no program is never pooled, even with every slot held", async () => {
  const env = scratchEnv("try");
  const admission = await admitTs7Run(["--version"], { label: "t", env, deps: { env } });
  expect(admission.kind).toBe("unpooled");
  expect(existsSync(hostPoolDir({ name: TS7_POOL_NAME, label: "", slots: 1 }, env)), "no pool was even opened").toBe(false);
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a queueing run takes a host slot sized by the profile, labelled with its program, and gives it back", async () => {
  const env = scratchEnv();
  const admission = await admitTs7Run(PROGRAM_ARGS, { label: "ts7 -p tsconfig.json in lane", env, deps: { env, pid: 700, alive: aliveOnly(700) } });
  expect(admission.kind).toBe("admitted");
  const slotFile = join(hostPoolDir({ name: TS7_POOL_NAME, label: "", slots: 1 }, env), "1.lock");
  expect(JSON.parse(readFileSync(slotFile, "utf8"))).toMatchObject({ pid: 700, label: "ts7 -p tsconfig.json in lane" });
  if (admission.kind === "admitted") {
    admission.lease.release();
  }
  expect(existsSync(slotFile)).toBe(false);
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});

test("a try run with every host slot live is told busy at once, and takes a slot the moment one frees", async () => {
  const env = scratchEnv("try");
  const slots = readConcurrencyProfile(env).ts7RunnersHostWide;
  const pool = { name: TS7_POOL_NAME, label: "a live typecheck", slots };
  const holders: HostSlotLease[] = [];
  for (let pid = 800; pid < 800 + slots; pid += 1) {
    const lease = tryAcquireHostSlot(pool, { env, pid, alive: () => true });
    if (lease !== null) {
      holders.push(lease);
    }
  }
  expect(holders, "the profile's derived slot count fills the pool").toHaveLength(slots);
  const busy = await admitTs7Run(PROGRAM_ARGS, { label: "hook", env, deps: { env, pid: 900, alive: () => true } });
  expect(busy).toStrictEqual({ kind: "busy", slots });
  holders[0]?.release();
  const admitted = await admitTs7Run(PROGRAM_ARGS, { label: "hook", env, deps: { env, pid: 901, alive: () => true } });
  expect(admitted.kind).toBe("admitted");
  if (admitted.kind === "admitted") {
    admitted.lease.release();
  }
  for (const holder of holders) {
    holder.release();
  }
  rmSync(env[HOST_POOL_ROOT_ENV] ?? "", { recursive: true, force: true });
});
