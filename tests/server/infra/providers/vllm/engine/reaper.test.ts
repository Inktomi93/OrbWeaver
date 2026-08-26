import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { EngineLaunchIdentity } from "@orb/server/infra/providers/vllm/engine";
import { ownedOrphanCandidates, parseEngineFamilyProcessRows, writeEngineLaunchIdentities } from "@orb/server/infra/providers/vllm/engine";
import { expect, test } from "../../../../../support/fixtures.ts";

function withRecord(run: (repoRoot: string, identity: EngineLaunchIdentity) => void): void {
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
    run(repoRoot, identity);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

test("parses pid, pgid, and full argv", () => {
  expect(parseEngineFamilyProcessRows("  77  42 VLLM::Worker_TP 0\ngarbage")).toEqual([{ pid: 77, pgid: 42, args: "VLLM::Worker_TP 0" }]);
});

test("foreign same-cwd/cmdline-shaped processes are never candidates without the recorded PGID", () => {
  withRecord((repoRoot) => {
    expect(ownedOrphanCandidates("  991 991 node foreign.js vllm serve", repoRoot)).toEqual([]);
  });
});

test("a survivor is related only by the exact recorded process group", () => {
  withRecord((repoRoot, identity) => {
    expect(ownedOrphanCandidates(`  5000 ${identity.pgid} VLLM::EngineCore`, repoRoot)).toEqual([{ pid: 5000, pgid: identity.pgid }]);
    expect(ownedOrphanCandidates(`  ${identity.pid} ${identity.pgid} vllm serve`, repoRoot)).toEqual([]);
  });
});

test("missing durable state fails closed", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-reaper-empty-"));
  try {
    expect(ownedOrphanCandidates("  991 991 node foreign.js vllm serve", repoRoot)).toEqual([]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
