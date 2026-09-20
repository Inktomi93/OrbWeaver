import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import type { EngineGroupAdoption, EngineLaunchIdentity, ObservedEngineProcess } from "@orb/tooling/stack/lib/engine-fleet";
import {
  adoptEngineGroup,
  captureEngineLaunchIdentity,
  ENGINE_LAUNCH_MARKER_ENV,
  engineAdoptionText,
  engineGroupMembers,
  engineIdentityFilePath,
  mintEngineLaunchMarker,
  parseEngineIdentityFile,
  readEngineIdentityFile,
  readEngineProcessLaunchMarker,
  reapOrphanedFamily,
  serializeEngineIdentityFile,
  signalAdoptedEngineGroup,
  signalEngineLaunchIdentity,
  signalOrphanedEngineGroup,
  signalRecordedEngineProcess,
  stopRecordedEngineProcess,
  verifyEngineLaunchIdentity,
  writeEngineLaunchIdentities,
} from "@orb/tooling/stack/lib/engine-fleet";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const FILE_MODE_MODULUS = 0o1000;
const MANUAL_CLEANUP_RE = /manual cleanup|relaunch/u;
const OWNERSHIP_HEURISTIC_RE = /PGID\/cwd\/argv do not prove ownership/u;
const RELAUNCH_GUIDANCE_RE = /relaunch|clean manually/u;

const OBSERVED: ObservedEngineProcess = {
  pid: 4242,
  pgid: 4242,
  startTicks: "998877",
  executable: "/usr/bin/python3.13",
  cmdlineBase64: Buffer.from("python\0/opt/vllm/bin/vllm\0serve\0").toString("base64"),
  cwd: "/repo",
};

const IDENTITY: EngineLaunchIdentity = {
  version: 1,
  engine: "embed",
  port: 8701,
  repoRoot: "/repo",
  ...OBSERVED,
};

test("the durable identity codec rejects malformed and dangerous process targets", () => {
  const file = { version: 1 as const, repoRoot: "/repo", engines: { embed: IDENTITY } };
  expect(parseEngineIdentityFile(serializeEngineIdentityFile(file))).toEqual(file);
  expect(parseEngineIdentityFile('{"version":1')).toBeNull();
  expect(parseEngineIdentityFile(JSON.stringify({ ...file, engines: { embed: { ...IDENTITY, pid: 1, pgid: 1 } } }))).toBeNull();
  expect(parseEngineIdentityFile(JSON.stringify({ ...file, engines: { embed: { ...IDENTITY, pgid: 0 } } }))).toBeNull();
});

test("ownership requires the launch record, listener, start ticks, executable, cmdline, cwd, and process group to match", () => {
  expect(verifyEngineLaunchIdentity(IDENTITY, OBSERVED, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 })).toEqual({
    verdict: "owned",
    pgid: 4242,
  });
  expect(verifyEngineLaunchIdentity(IDENTITY, null, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: null }).verdict).toBe("absent");
  expect(
    verifyEngineLaunchIdentity(IDENTITY, { ...OBSERVED, startTicks: "998878" }, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 }).verdict,
  ).toBe("refused");
  expect(
    verifyEngineLaunchIdentity(IDENTITY, { ...OBSERVED, executable: "/usr/bin/foreign" }, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 })
      .verdict,
  ).toBe("refused");
  expect(
    verifyEngineLaunchIdentity(
      IDENTITY,
      { ...OBSERVED, cmdlineBase64: Buffer.from("foreign\0").toString("base64") },
      { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 },
    ).verdict,
  ).toBe("refused");
  expect(
    verifyEngineLaunchIdentity(IDENTITY, { ...OBSERVED, pgid: 31_337 }, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 }).verdict,
  ).toBe("refused");
  expect(
    verifyEngineLaunchIdentity(IDENTITY, { ...OBSERVED, cwd: "/tmp" }, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 }).verdict,
  ).toBe("refused");
  expect(verifyEngineLaunchIdentity(IDENTITY, OBSERVED, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 7331 }).verdict).toBe("refused");
});

test("a stale or foreign target is refused before the signal syscall", () => {
  const calls: Array<readonly [number, NodeJS.Signals]> = [];
  const kill = (target: number, signal: NodeJS.Signals): void => {
    calls.push([target, signal]);
  };
  const staleObserved: readonly (ObservedEngineProcess | null)[] = [
    null,
    { ...OBSERVED, startTicks: "998878" },
    { ...OBSERVED, executable: "/usr/bin/foreign" },
    { ...OBSERVED, cmdlineBase64: Buffer.from("foreign\0").toString("base64") },
    { ...OBSERVED, pgid: 31_337 },
    { ...OBSERVED, cwd: "/tmp" },
  ];
  for (const observed of staleObserved) {
    expect(
      signalEngineLaunchIdentity(IDENTITY, "SIGTERM", {
        engine: "embed",
        port: 8701,
        repoRoot: "/repo",
        listenerPid: 4242,
        readProcess: () => observed,
        kill,
      }).verdict,
    ).toBe("refused");
  }
  expect(
    signalEngineLaunchIdentity(IDENTITY, "SIGKILL", {
      engine: "embed",
      port: 8701,
      repoRoot: "/repo",
      listenerPid: 7331,
      readProcess: () => OBSERVED,
      kill,
    }).verdict,
  ).toBe("refused");
  expect(
    signalEngineLaunchIdentity({ ...IDENTITY, pid: 1, pgid: 1 }, "SIGKILL", {
      engine: "embed",
      port: 8701,
      repoRoot: "/repo",
      listenerPid: 1,
      readProcess: () => ({ ...OBSERVED, pid: 1, pgid: 1 }),
      kill,
    }).verdict,
  ).toBe("refused");
  expect(calls).toEqual([]);
});

test("orphan recovery refuses a stable same-group survivor after the durable leader is absent", () => {
  const survivor = { ...OBSERVED, pid: 5000, pgid: IDENTITY.pgid };
  const calls: Array<readonly [number, NodeJS.Signals]> = [];
  const readProcess = (pid: number): ObservedEngineProcess | null => {
    if (pid === IDENTITY.pid) {
      return null;
    }
    return pid === survivor.pid ? survivor : null;
  };
  expect(signalOrphanedEngineGroup(IDENTITY, survivor.pid, "SIGKILL", { readProcess, kill: (target, signal) => calls.push([target, signal]) })).toEqual({
    verdict: "refused",
    reason: expect.stringMatching(MANUAL_CLEANUP_RE),
  });
  expect(calls).toEqual([]);
});

test("leader reuse and every absent-leader survivor shape receive zero signals", () => {
  const calls: number[] = [];
  const survivor = { ...OBSERVED, pid: 5000, pgid: IDENTITY.pgid };
  expect(
    signalOrphanedEngineGroup(IDENTITY, survivor.pid, "SIGKILL", {
      readProcess: (pid) => (pid === IDENTITY.pid ? { ...OBSERVED, startTicks: "reused" } : survivor),
      kill: (target) => calls.push(target),
    }).verdict,
  ).toBe("refused");
  expect(
    signalOrphanedEngineGroup(IDENTITY, survivor.pid, "SIGKILL", {
      readProcess: (pid) => (pid === IDENTITY.pid ? null : { ...survivor, pgid: 7331 }),
      kill: (target) => calls.push(target),
    }).verdict,
  ).toBe("refused");
  let reads = 0;
  expect(
    signalOrphanedEngineGroup(IDENTITY, survivor.pid, "SIGKILL", {
      readProcess: (pid) => (pid === IDENTITY.pid ? null : { ...survivor, startTicks: String(100 + reads++) }),
      kill: (target) => calls.push(target),
    }).verdict,
  ).toBe("refused");
  expect(calls).toEqual([]);
});

test("launch identities merge by engine through one atomic owner-only record", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-engine-identity-"));
  try {
    const embed = { ...IDENTITY, repoRoot };
    const gen: EngineLaunchIdentity = { ...IDENTITY, engine: "gen", port: 8703, repoRoot, pid: 5252, pgid: 5252 };
    writeEngineLaunchIdentities(repoRoot, [embed]);
    writeEngineLaunchIdentities(repoRoot, [gen]);
    expect(readEngineIdentityFile(repoRoot)).toEqual({ version: 1, repoRoot, engines: { embed, gen } });
    expect(statSync(engineIdentityFilePath(repoRoot)).mode % FILE_MODE_MODULUS).toBe(0o600);
    expect(readFileSync(engineIdentityFilePath(repoRoot), "utf8")).not.toContain("tmp-");
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("a launch identity captured from a disposable owned process can stop its own process group", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-owned-engine-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 60_000)"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
  });
  await once(child, "spawn");
  const pid = child.pid;
  expect(pid).toBeGreaterThan(1);
  if (pid === undefined || pid <= 1) {
    throw new Error("owned-process test did not receive a safe child pid");
  }

  try {
    const identity = captureEngineLaunchIdentity("gen", 8703, repoRoot, pid);
    expect(identity).not.toBeNull();
    if (identity === null) {
      throw new Error("owned-process test could not capture the child identity");
    }
    const exited = once(child, "exit");
    writeEngineLaunchIdentities(repoRoot, [identity]);
    const result = signalRecordedEngineProcess({
      repoRoot,
      engine: "gen",
      port: 8703,
      listenerPid: pid,
      signal: "SIGTERM",
    });
    expect(result).toEqual({ verdict: "signaled", pgid: pid });
    await exited;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // The owned child can exit between the state read and cleanup signal.
      }
    }
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("the reaper refuses an absent recorded leader and emits manual-cleanup guidance", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-owned-orphan-"));
  try {
    const identity: EngineLaunchIdentity = { ...IDENTITY, repoRoot, cwd: repoRoot };
    writeEngineLaunchIdentities(repoRoot, [identity]);
    const warnings: string[] = [];
    expect(await reapOrphanedFamily(repoRoot, { readProcess: () => null, warn: (_fields, message) => warnings.push(message) })).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(OWNERSHIP_HEURISTIC_RE);
    expect(warnings[0]).toMatch(RELAUNCH_GUIDANCE_RE);
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("missing durable state never consults the process table", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-foreign-engine-"));
  try {
    let reads = 0;
    expect(
      await reapOrphanedFamily(repoRoot, {
        readProcess: () => {
          reads += 1;
          return OBSERVED;
        },
      }),
    ).toEqual([]);
    expect(reads).toBe(0);
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

// ── #1756: adoption is a STRICTER door, never a relaxation of the standing rule ──────────────────────
//
// The rule above ("the reaper refuses an absent recorded leader and emits manual-cleanup guidance") is
// intact and its arm is untouched. What changed is the PREMISE it rested on — "a survivor carries no launch
// identity" — which was true only because nothing stamped one. `buildEngineSpawnSpec` now puts a per-launch
// marker in the engine's spawn env, so every member of its setsid group inherits it and the record keeps
// the leader's copy. These pin that the new door needs MORE evidence than the pgid, not less: UNANIMITY
// among live members, because a pgid can be reused and an unrelated process can end up in a group we did
// not start.
const MARKER = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OTHER_MARKER = "00000000-0000-4000-8000-000000000000";
const MARKED: EngineLaunchIdentity = { ...IDENTITY, launchMarker: MARKER };
/** The recorded leader is GONE — the whole premise of an adoption question. */
const NO_LEADER = { readProcess: (): ObservedEngineProcess | null => null };
/** A real-process arm on a loaded box needs more than vitest's 5s default (the SHELL_ARM_TIMEOUT_MS class),
 *  and the ceiling is DERIVED through the one load budget rather than typed (policy `tooling-clock-budget`):
 *  30s is a statement about a quiet box, and a spawn-and-settle arm that times out under homelab contention
 *  is a false RED about the box, not about launch ownership. A quiet box gets the base byte-identical. */
const LIVE_GROUP_ARM_TIMEOUT_MS = scaledBudget(30_000);
const GROUP_SETTLE_POLL_MS = 50;
const GROUP_SETTLE_TRIES = 200;

test("a leaderless engine group whose every live member carries the launch marker is ADOPTABLE (#1756)", () => {
  const adoption = adoptEngineGroup(MARKED, { ...NO_LEADER, members: () => [5000, 5001], markerOf: () => MARKER });
  expect(adoption).toEqual({ kind: "adoptable", pgid: MARKED.pgid, members: [5000, 5001] });
  expect(engineAdoptionText(adoption)).toContain("ADOPTED by launch marker");
});

test("ONE unmarked member refuses the whole group — adoption is unanimous or nothing (#1756)", () => {
  // The reused-pgid / unrelated-joiner case. A majority is not evidence: the signal is a GROUP signal, so
  // anything short of unanimity would land it on a process this launch never started.
  const adoption = adoptEngineGroup(MARKED, { ...NO_LEADER, members: () => [5000, 5001], markerOf: (pid) => (pid === 5001 ? null : MARKER) });
  expect(adoption).toEqual({ kind: "unmarked", pgid: MARKED.pgid, unmarked: [5001] });
  expect(engineAdoptionText(adoption)).toContain("5001");
  expect(engineAdoptionText(adoption)).toContain("manual cleanup required");
  // A member carrying a DIFFERENT launch's marker is just as foreign as one carrying none.
  expect(adoptEngineGroup(MARKED, { ...NO_LEADER, members: () => [5000], markerOf: () => OTHER_MARKER }).kind).toBe("unmarked");
});

test("a record with NO marker is unadoptable — the pre-#1756 refusal, unchanged (#1756)", () => {
  // Every engines.pgid written before the marker existed lands here, and so does one written by a launcher
  // that exported none. The old refusal is the fallback, not an error path.
  const adoption = adoptEngineGroup(IDENTITY, { ...NO_LEADER, members: () => [5000], markerOf: () => MARKER });
  expect(adoption.kind).toBe("no-marker");
  expect(engineAdoptionText(adoption)).toContain("carries no launch marker");
});

test("a LIVE recorded leader adopts nothing — the ordinary identity door owns that decision (#1756)", () => {
  // The marker door only ever answers the leaderless question. While the leader is alive the record is
  // verifiable field-by-field (start ticks, executable, cmdline, cwd) — strictly more than group membership
  // proves — and a mismatch there is a refusal group membership must never overturn.
  const adoption = adoptEngineGroup(MARKED, { readProcess: () => OBSERVED, members: () => [5000], markerOf: () => MARKER });
  expect(adoption.kind).toBe("leader-live");
  expect(engineAdoptionText(adoption)).toContain("ordinary identity door");
});

test("an EMPTY group is neither adoptable nor an alarm (#1756)", () => {
  expect(adoptEngineGroup(MARKED, { ...NO_LEADER, members: () => [], markerOf: () => MARKER })).toEqual({ kind: "empty", pgid: MARKED.pgid });
});

test("only an ADOPTABLE group reaches the negative-PGID signal (#1756)", () => {
  const calls: Array<readonly [number, NodeJS.Signals]> = [];
  const kill = (target: number, sig: NodeJS.Signals): number => calls.push([target, sig]);

  expect(signalAdoptedEngineGroup(MARKED, "SIGTERM", { ...NO_LEADER, members: () => [5000], markerOf: () => MARKER, kill }).kind).toBe("adoptable");
  // The NEGATIVE pgid is the whole mechanism — a positive one would signal the dead leader instead.
  expect(calls).toEqual([[-MARKED.pgid, "SIGTERM"]]);

  // …and every refusing shape signals NOTHING, which is the standing rule this door had to preserve.
  calls.length = 0;
  signalAdoptedEngineGroup(MARKED, "SIGKILL", { ...NO_LEADER, members: () => [5000, 5001], markerOf: (pid) => (pid === 5001 ? null : MARKER), kill });
  signalAdoptedEngineGroup(IDENTITY, "SIGKILL", { ...NO_LEADER, members: () => [5000], markerOf: () => MARKER, kill });
  signalAdoptedEngineGroup(MARKED, "SIGKILL", { ...NO_LEADER, members: () => [], markerOf: () => MARKER, kill });
  signalAdoptedEngineGroup(MARKED, "SIGKILL", { readProcess: () => OBSERVED, members: () => [5000], markerOf: () => MARKER, kill });
  expect(calls, "an unmarked, unmarkable, empty or still-led group must never be signalled").toEqual([]);
});

test("a malformed marker makes the whole engine record CORRUPT, not merely unmarked (#1756)", () => {
  // Silently dropping a bad marker would turn a tampered engines.pgid into an ordinary pre-#1756 record and
  // re-open the door the marker closes, so the parse refuses the file outright.
  const marked = { version: 1 as const, repoRoot: "/repo", engines: { embed: MARKED } };
  expect(parseEngineIdentityFile(serializeEngineIdentityFile(marked))).toEqual(marked);
  for (const bad of ["short", `${MARKER}; rm -rf /`, 42]) {
    expect(parseEngineIdentityFile(JSON.stringify({ ...marked, engines: { embed: { ...IDENTITY, launchMarker: bad } } })), String(bad)).toBeNull();
  }
  // …and a record with no marker at all still parses: an old pidfile must stay stoppable.
  expect(parseEngineIdentityFile(JSON.stringify({ version: 1, repoRoot: "/repo", engines: { embed: IDENTITY } }))).toEqual({
    version: 1,
    repoRoot: "/repo",
    engines: { embed: IDENTITY },
  });
});

test("the /proc environ read accepts only a well-formed marker under the contract name (#1756)", () => {
  const environ = (pairs: readonly string[]): Buffer => Buffer.from(`${pairs.join("\0")}\0`, "utf8");
  expect(readEngineProcessLaunchMarker(4242, () => environ(["PATH=/usr/bin", `${ENGINE_LAUNCH_MARKER_ENV}=${MARKER}`, "HOME=/root"]))).toBe(MARKER);
  // A near-miss name is not the contract name — a prefix match would let any env var authorize a group kill.
  expect(readEngineProcessLaunchMarker(4242, () => environ([`${ENGINE_LAUNCH_MARKER_ENV}_OLD=${MARKER}`]))).toBeNull();
  expect(readEngineProcessLaunchMarker(4242, () => environ(["PATH=/usr/bin"]))).toBeNull();
  expect(readEngineProcessLaunchMarker(4242, () => environ([`${ENGINE_LAUNCH_MARKER_ENV}=short`]))).toBeNull();
  expect(
    readEngineProcessLaunchMarker(4242, () => {
      throw new Error("EACCES");
    }),
  ).toBeNull();
});

// THE WHOLE MECHANISM, END TO END, on REAL processes — the receipt #1013 left open for the engines: a leader
// that dies while its group carries on serving. The engine launcher itself is NEVER executed (it spawns real
// vLLM against the live ports and reaps every engine it does not own), so the stand-in is a disposable
// setsid leader that spawns a group member and then dies, carrying the same marker the spawn spec exports.
test(
  "a DEAD leader's marked group is adopted from the living tree and stopped (#1756)",
  async () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-engine-adopt-"));
    const marker = mintEngineLaunchMarker();
    // `detached` makes the leader its own process-group leader (what setsid does for a real engine); the
    // grandchild it spawns inherits BOTH the group and the marker, exactly like vLLM's EngineCore workers.
    const leader = spawn(
      process.execPath,
      [
        "-e",
        "require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>undefined,60000)'],{stdio:'ignore'});setInterval(()=>undefined,60000)",
      ],
      {
        cwd: repoRoot,
        detached: true,
        stdio: "ignore",
        // A MINIMAL env on purpose: the marker is the only variable this tree needs, and inheriting the
        // runner's environment would make "the child carries the marker" unfalsifiable if it ever leaked in.
        env: { [ENGINE_LAUNCH_MARKER_ENV]: marker },
      },
    );
    await once(leader, "spawn");
    const leaderPid = leader.pid;
    if (leaderPid === undefined || leaderPid <= 1) {
      throw new Error("adoption test did not receive a safe leader pid");
    }
    try {
      // The record the launcher would have written — captured from the live leader, marker and all.
      const identity = captureEngineLaunchIdentity("gen", 8703, repoRoot, leaderPid);
      expect(identity?.launchMarker, "the capture must record the marker the leader actually carries").toBe(marker);
      if (identity === null) {
        throw new Error("adoption test could not capture the leader identity");
      }

      // Wait for the grandchild to join the group, then kill ONLY the leader: the exact shape that used to
      // leave `engines stop` refusing a live engine it had started.
      await settle(() => engineGroupMembers(leaderPid).length === 2);
      const exited = once(leader, "exit");
      process.kill(leaderPid, "SIGKILL");
      await exited;
      await settle(() => engineGroupMembers(leaderPid).length === 1);

      // The ordinary door still refuses — untouched — and the marker door adopts what it can prove.
      expect(verifyEngineLaunchIdentity(identity, null, { engine: "gen", port: 8703, repoRoot, listenerPid: null }).verdict).toBe("absent");
      const survivors = engineGroupMembers(leaderPid);
      expect(survivors).toHaveLength(1);
      expect(survivors[0]).not.toBe(leaderPid);
      const adoption = adoptEngineGroup(identity);
      expect(adoption, engineAdoptionText(adoption)).toEqual({ kind: "adoptable", pgid: leaderPid, members: survivors });

      expect(signalAdoptedEngineGroup(identity, "SIGKILL").kind).toBe("adoptable");
      await settle(() => engineGroupMembers(leaderPid).length === 0);
      expect(engineGroupMembers(leaderPid)).toEqual([]);
    } finally {
      try {
        process.kill(-leaderPid, "SIGKILL");
      } catch {
        // The group can already be gone — that is the success path.
      }
      rmSync(repoRoot, { force: true, recursive: true });
    }
  },
  LIVE_GROUP_ARM_TIMEOUT_MS,
);

/** Poll a real-process condition to settled — a same-tick read of a just-spawned or just-killed tree is a
 *  false negative by construction. */
async function settle(done: () => boolean): Promise<void> {
  for (let tries = 0; tries < GROUP_SETTLE_TRIES; tries += 1) {
    if (done()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, GROUP_SETTLE_POLL_MS));
  }
}

// THE TWO DOORS IN ORDER — what `engines stop` actually calls (#1756). engines-ctl's own suite is
// grammar-only by design (every one of its verbs touches the live fleet, so the dispatch probe stops before
// `fn()`), which is exactly why the decision it delegates to is pinned HERE, on a real identity file in a
// tmpdir, with the adoption door injected so nothing is signalled.
test("stop runs the ORDINARY door first and consults the marker door only when it declines (#1756)", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-engine-stop-"));
  try {
    const identity: EngineLaunchIdentity = { ...IDENTITY, engine: "gen", port: 8703, repoRoot, cwd: repoRoot, launchMarker: MARKER };
    writeEngineLaunchIdentities(repoRoot, [identity]);
    const asked: EngineLaunchIdentity[] = [];
    const adopt = (record: EngineLaunchIdentity): EngineGroupAdoption => {
      asked.push(record);
      return { kind: "adoptable", pgid: record.pgid, members: [record.pgid + 1] };
    };

    // The recorded leader is long gone and a live listener holds the port — the receipt this row exists for:
    // `engines stop` refusing a LIVE engine named by a dead launch record, ending in a hand-run pgid kill.
    const adopted = stopRecordedEngineProcess({ repoRoot, engine: "gen", port: 8703, listenerPid: identity.pid + 1, signal: "SIGTERM", adopt });
    expect(adopted.recorded.verdict, "the ordinary door's refusal is UNCHANGED").toBe("refused");
    expect(adopted.signaled, "the marker door authorized it").toBe(true);
    expect(adopted.adoption?.kind).toBe("adoptable");
    expect(asked).toHaveLength(1);

    // A refusing marker door leaves the stop REFUSED — an adoption failure must never be tallied as a stop.
    const unmarked = stopRecordedEngineProcess({
      repoRoot,
      engine: "gen",
      port: 8703,
      listenerPid: identity.pid + 1,
      signal: "SIGKILL",
      adopt: (record) => ({ kind: "unmarked", pgid: record.pgid, unmarked: [record.pgid + 1] }),
    });
    expect(unmarked.signaled).toBe(false);
    expect(unmarked.adoption?.kind).toBe("unmarked");

    // No record for that engine ⇒ nothing to adopt, and the marker door is never even asked.
    const asked2: EngineLaunchIdentity[] = [];
    const none = stopRecordedEngineProcess({
      repoRoot,
      engine: "embed",
      port: 8701,
      listenerPid: null,
      signal: "SIGTERM",
      adopt: (record): EngineGroupAdoption => {
        asked2.push(record);
        return { kind: "empty", pgid: record.pgid };
      },
    });
    expect(none.recorded.verdict).toBe("absent");
    expect(none.signaled).toBe(false);
    expect(none.adoption).toBeUndefined();
    expect(asked2).toEqual([]);
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});
