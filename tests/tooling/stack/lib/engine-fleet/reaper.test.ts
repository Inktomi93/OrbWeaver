import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { EngineLaunchIdentity } from "@orb/tooling/stack/lib/engine-fleet";
import { reapOrphanedFamily, writeEngineLaunchIdentities } from "@orb/tooling/stack/lib/engine-fleet";
import { expect, test } from "../../../../support/tool-fixtures.ts";

async function withRecord(run: (repoRoot: string, identity: EngineLaunchIdentity) => Promise<void>): Promise<void> {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-reaper-"));
  const identity: EngineLaunchIdentity = {
    version: 1,
    engine: "gen",
    port: 8703,
    repoRoot,
    pid: 4242,
    pgid: 4242,
    startTicks: "99",
    executable: "/usr/bin/python",
    cmdlineBase64: Buffer.from("vllm\0serve\0").toString("base64"),
    cwd: repoRoot,
  };
  try {
    writeEngineLaunchIdentities(repoRoot, [identity]);
    await run(repoRoot, identity);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

test("an absent leader cannot transfer authority to any survivor heuristic", async () => {
  await withRecord(async (repoRoot, identity) => {
    const foreignSurvivor = {
      ...identity,
      pid: 5000,
      startTicks: "999",
      executable: "/usr/bin/foreign",
      cmdlineBase64: Buffer.from("vllm\0serve\0").toString("base64"),
    };
    const processTable = new Map([[foreignSurvivor.pid, foreignSurvivor]]);
    const warnings: string[] = [];
    expect(
      await reapOrphanedFamily(repoRoot, {
        readProcess: (pid) => processTable.get(pid) ?? null,
        warn: (_fields, message) => warnings.push(message),
      }),
    ).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("PGID/cwd/argv do not prove ownership");
  });
});

test("a reused leader is refused and operator-visible", async () => {
  await withRecord(async (repoRoot, identity) => {
    const warnings: Array<{ readonly fields: Record<string, unknown>; readonly message: string }> = [];
    expect(
      await reapOrphanedFamily(repoRoot, {
        readProcess: () => ({ ...identity, startTicks: "100" }),
        warn: (fields, message) => warnings.push({ fields, message }),
      }),
    ).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.fields["reason"]).toContain("stale or reused process");
  });
});

test("missing durable state fails closed without reading a process", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-reaper-empty-"));
  try {
    let reads = 0;
    expect(
      await reapOrphanedFamily(repoRoot, {
        readProcess: () => {
          reads += 1;
          return null;
        },
      }),
    ).toEqual([]);
    expect(reads).toBe(0);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
