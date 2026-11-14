// THE STAGE TEARS ITSELF DOWN (#1163 arm b, tooling/src/snap/ops/stage-keeper.ts) — the SHIPPED keeper
// process, spawned as the real `snap --stage-keeper <band>` cli entry, against a PLANTED loopback stage.
//
// NOTHING HERE BOOTS A STACK, AND NOTHING HERE TOUCHES A REAL BAND (design §8: node + loopback servers
// only; a committed proof never boots the dev stack). Two fences make that true:
//  • the band TABLE is a tmpdir, reached through `ORB_SNAP_STAGE_HOME` — writing the box's real
//    `bands.json` would evict a live sibling lane's stage (the stage-marker suite's standing rule);
//  • the planted stage's PORTS are EPHEMERAL (`listen(0)`), never `stageBandPorts(band)`. The row's band
//    index is just its key; every teardown path reads the ROW's ports. So the reap kills exactly the
//    process this file started and can never reach a real band a sibling lane is serving on.
// The planted server runs with its cwd inside `.cache/snap-stage/`, which is what makes `pidIsStageRooted`
// true — the same fence production's teardown uses — and it is spawned DETACHED so the group kill lands on
// its own pgid and never on this test runner's.
//
// PLANTED CONTROLS, BOTH DIRECTIONS. Every "the timer waits" arm is followed by REMOVING the one fact that
// held it and watching the same timer reap — otherwise "it did not reap" would be satisfied by a keeper
// that had simply died. And the reserved-port arm plants a row on the DEV STACK's own pair to prove the
// refusal exists at all.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Socket } from "node:net";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, test } from "@orb/testkit/tooling";
import { REPO_ROOT } from "@orb/tooling/floor/artifacts/artifacts";
import { pidAlive } from "@orb/tooling/floor/artifacts/run-retention";
import { listProcesses } from "@orb/tooling/floor/host/platform";
import { DEV_PORTS } from "@orb/tooling/floor/host/ports";
import type { NicedChild } from "@orb/tooling/floor/process/proc";
import { spawnNiced, spawnNicedChild } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import type { StageRow } from "@orb/tooling/snap";
import { readBands, readStageReaps, stageKeeperLogPath } from "@orb/tooling/snap";
import { afterEach, describe, onTestFinished, vi } from "vitest";
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { diskSafeArgv, diskSafeUrl } from "../../../../tooling/src/snap/lib/disk-safe-argv.ts";
// The table's WRITERS are not front-door members (the door exports the readers a sibling tool needs), so
// this proof reaches them at their source path — the spelling tests/tooling/snap/ops/stage-marker.int.test.ts
// already uses for the same modules.
import { touchSessionHeartbeat } from "../../../../tooling/src/snap/ops/session-heartbeat.ts";
import { bindSessionToBand, unbindSessionFromBand, writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { spawnedPid } from "../../_child-pid.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CASE_BUDGET_MS = scaledBudget(120_000, 4);
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });
/** The proof TTL: three seconds, which `keeperPollMs` turns into a 300 ms poll. Every "wait" arm below
 *  holds for at least 2x this, so a survival is a decision rather than a race. */
const TTL_MIN = "0.05";
const TTL_MS = 3000;
const POLL_MS = 100;
const STAGE_KEY = "0123456789ab";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const BAND = 7;

const SNAP_CLI = join(REPO_ROOT, "tooling/src/snap/cli.ts");

// A spawned keeper measures idle time on its own wall clock, so this file states no time: an expired row is
// stamped at the epoch and a row that must only stay alive far in the future. The re-arm case stamps through
// the daemon heartbeat, which reads the keeper's clock itself.
const EXPIRED_ISO = "1970-01-01T00:00:00.000Z";
const FRESH_ISO = "9999-01-01T00:00:00.000Z";

/** A loopback pair that answers nothing and never exits — the smallest thing that is INDISTINGUISHABLE
 *  from a stage to every probe production uses: two bound ports and a process rooted in a stage dir. */
const LOOPBACK_SRC = `import { createServer } from "node:http";
const servers = [createServer((_q, s) => s.end("ok")), createServer((_q, s) => s.end("ok"))];
let ready = 0;
for (const server of servers) {
  server.listen(0, "127.0.0.1", () => {
    ready += 1;
    if (ready === 2) {
      console.log("READY " + servers.map((s) => s.address().port).join(" "));
    }
  });
}
setInterval(() => undefined, 1000);
`;

interface PlantedStage {
  readonly child: NicedChild;
  readonly serverPort: number;
  readonly vitePort: number;
  readonly dir: string;
}

const started: NicedChild[] = [];
const openSockets: Socket[] = [];

afterEach(() => {
  for (const child of started.splice(0)) {
    child.killGroup("SIGKILL");
  }
  for (const socket of openSockets.splice(0)) {
    socket.destroy();
  }
});

function scratchHome(label: string): string {
  const home = mkdtempSync(join(tmpdir(), `cbst-keeper-${label}-`));
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, ".cache", "snap-stage"), { recursive: true });
  mkdirSync(join(home, "sessions"), { recursive: true });
  return home;
}

// Each wait ends on the fact it waits for; the case budget bounds a fact that never comes, and the failure is read
// when it fires, so it carries the keeper's log as it stood then.
async function expectEventually(predicate: () => boolean, failure: () => string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!predicate()) {
        throw new Error(failure());
      }
    },
    { timeout: CASE_BUDGET_MS, interval: POLL_MS },
  );
}

/** Start the planted stage and wait for both ports. Detached (its own pgid) so production's group kill
 *  reaches it and nothing else. */
async function plantStage(home: string): Promise<PlantedStage> {
  const dir = join(home, ".cache", "snap-stage", STAGE_KEY);
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "cbst-loopback.mjs");
  writeFileSync(script, LOOPBACK_SRC);
  let output = "";
  const child = spawnNicedChild(process.execPath, [script], {
    cwd: dir,
    onOutput: (chunk) => {
      output += chunk.toString();
    },
  });
  started.push(child);
  await expectEventually(
    () => /READY \d+ \d+/u.test(output),
    () => `the planted stage never bound both ports: ${output}`,
  );
  const ports = /READY (\d+) (\d+)/u.exec(output);
  if (ports === null) {
    throw new Error(`the planted stage's ready line lost its ports: ${output}`);
  }
  return { child, dir, serverPort: Number(ports[1]), vitePort: Number(ports[2]) };
}

function plantRow(home: string, stage: PlantedStage, stampIso: string, over: Partial<StageRow> = {}): StageRow {
  const row: StageRow = {
    band: BAND,
    sha: SHA,
    dir: stage.dir,
    serverPort: stage.serverPort,
    vitePort: stage.vitePort,
    checkout: home,
    ownerPid: stage.child.pid ?? null,
    startedAt: stampIso,
    lastUsedAt: stampIso,
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    ...over,
  };
  writeRow(home, row);
  return row;
}

/** Start the keeper the way PRODUCTION does — with a `logPath`, never a pipe. `spawnNicedChild` gives a
 *  child with neither `logPath` nor `onOutput` two pipes nobody reads: the keeper's first write after its
 *  launcher exits would be EPIPE, and the launcher's own stream handles would keep its event loop
 *  referenced. Reading the LOG here is therefore not a convenience — it is the proof that the shipped
 *  detachment shape delivers the one line #1163 asks the timer to print. */
function startKeeper(home: string): { readonly child: NicedChild; readonly log: () => string } {
  const logPath = stageKeeperLogPath(home, BAND);
  mkdirSync(dirname(logPath), { recursive: true });
  const child = spawnNicedChild(process.execPath, [SNAP_CLI, "--stage-keeper", String(BAND)], {
    cwd: REPO_ROOT,
    logPath,
    // Through the ambient-env door, and as a pair LIST so the four SCREAMING_SNAKE knobs are data rather
    // than identifiers a naming rule has an opinion about (the stage-death-control suite's spelling).
    env: inheritedProcessEnv(
      Object.fromEntries([
        ["ORB_SNAP_STAGE_HOME", home],
        ["ORB_SNAP_SESSION_HOME", join(home, "sessions")],
        ["ORB_STAGE_TTL_MIN", TTL_MIN],
        ["ORB_STAGE_CAP", "10"],
      ]),
    ),
  });
  started.push(child);
  return { child, log: () => (existsSync(logPath) ? readFileSync(logPath, "utf8") : "") };
}

function rowOf(home: string): StageRow | undefined {
  return readBands(home).find((row) => row.band === BAND);
}

/** How many `--stage-keeper` processes tracing THIS SUITE's own `home` exist on the box right now.
 *  Counted by argv+env rather than by the table, because the property under test is about PROCESSES a
 *  run may leave behind, not about rows — and the process table is the only thing that can see a child
 *  whose row was never written. Filtered to `home` because `--stage-keeper <band>` (the argv) carries no
 *  home — a box-global count would have a SIBLING lane's own live keeper move this suite's delta either
 *  way. Each candidate's environment must carry THIS home, so a keeper started elsewhere never counts here
 *  (darwin folds the environment into the command line; win32 exposes none, so there nothing counts). */
function keeperProcessCount(home: string): number {
  const marker = `ORB_SNAP_STAGE_HOME=${home}`;
  return listProcesses().filter((entry) => entry.cmdline.includes("--stage-keeper") && (entry.environ ?? entry.cmdline).includes(marker)).length;
}

/** The session-registry row a live daemon writes — `daemonPid` is THIS process, so `liveSessionNames`
 *  answers "alive" against a pid that genuinely exists rather than a number that happens to be free. Liveness
 *  reads the pid alone, so the row's own stamps carry no time. */
function liveSessionRow(home: string, name: string): SessionRow {
  return {
    v: 1,
    name,
    ownerCheckout: home,
    daemonPid: process.pid,
    pgid: process.pid,
    socket: "/tmp/cbst.sock",
    cdpEndpoint: null,
    slotDir: "/tmp/slot",
    binding: { kind: "stage", url: diskSafeUrl("http://127.0.0.1:1") },
    environment: {
      viewport: { width: 1280, height: 720 },
      device: null,
      colorScheme: null,
      reducedMotion: false,
      contrast: null,
      reducedTransparency: false,
      deviceScaleFactor: null,
    },
    bootArgv: diskSafeArgv([]),
    createdAt: EXPIRED_ISO,
    lastUsedAt: EXPIRED_ISO,
    inflightOp: null,
    lastOp: null,
    ttlMs: 1_800_000,
    headless: true,
    calls: 0,
  };
}

function writeLiveSessionRow(home: string, name: string): void {
  writeFileSync(join(home, "sessions", `${name}.json`), JSON.stringify(liveSessionRow(home, name)));
}

describe("the stage's own idle timer", () => {
  test("an idle stage tears ITSELF down: process group dead, row cleared, one log line, ledger arm `timer`", async () => {
    const home = scratchHome("reap");
    const stage = await plantStage(home);
    plantRow(home, stage, EXPIRED_ISO);
    const stagePid = spawnedPid(stage.child);
    // The control that makes "dead" mean something: it is alive, and nothing but the timer runs here.
    expect(pidAlive(stagePid), "the planted stage is running before the timer fires").toBe(true);

    const keeper = startKeeper(home);

    // The DEFECT the pin proves, asserted first and through the table rather than through the new API:
    // nobody asks for this band, nobody sweeps, and the stage must still be gone.
    await expectEventually(
      () => rowOf(home) === undefined,
      () => `band ${BAND}'s row was never cleared — ${keeper.log()}`,
    );
    await expectEventually(
      () => !pidAlive(stagePid),
      () => "the stage's process group outlived its own timer",
    );

    await expectEventually(
      () => keeper.child.hasExited(),
      () => `the keeper outlived its own reap — ${keeper.log()}`,
    );
    expect(keeper.log()).toContain(`TIMER REAPED band ${BAND}`);
    expect(keeper.log()).toContain("no live session and no connected client");
    const reaps = readStageReaps(home);
    expect(reaps.at(-1)).toMatchObject({ band: BAND, arm: "timer", checkout: home });
  });

  test("an interaction re-arms it — the stage survives 2x the window, then the same timer reaps once the interactions stop", async () => {
    const home = scratchHome("rearm");
    const stage = await plantStage(home);
    plantRow(home, stage, FRESH_ISO);
    const keeper = startKeeper(home);
    // The heartbeat a daemon call writes stamps the band on the clock the keeper reads; the session is not bound
    // to the band, so only the stamp can hold the stage.
    const heartbeat = { home: join(home, "sessions"), stageHome: home, stageBand: BAND, row: liveSessionRow(home, "p-cbst-rearm") };

    // Six stamps at a third of the window each: >2x the TTL of continuous survival.
    for (let beat = 0; beat < 6; beat += 1) {
      await sleep(TTL_MS / 3);
      touchSessionHeartbeat(heartbeat);
      expect(rowOf(home), `the timer reaped a stage that was used ${TTL_MS / 3}ms ago (beat ${beat}) — ${keeper.log()}`).toBeDefined();
    }
    expect(keeper.child.hasExited(), "the keeper must still be waiting, not dead").toBe(false);

    // The positive control: stop stamping and the SAME keeper reaps, so the survival above was a decision.
    await expectEventually(
      () => rowOf(home) === undefined,
      () => `the re-armed timer never fired — ${keeper.log()}`,
    );
    expect(keeper.log()).toContain(`TIMER REAPED band ${BAND}`);
  });

  test("a LIVE session ref blocks the timer whatever the idle age; unbinding it lets the same timer fire", async () => {
    const home = scratchHome("session");
    const stage = await plantStage(home);
    plantRow(home, stage, EXPIRED_ISO);
    const name = "p-cbst-keeper";
    writeLiveSessionRow(home, name);
    // Binding is itself an interaction and stamps the heartbeat, so it stamps an expired one: the ONLY thing
    // that can save the row now is the session ref.
    bindSessionToBand(home, BAND, name, EXPIRED_ISO);

    const keeper = startKeeper(home);
    await sleep(TTL_MS * 2);
    expect(rowOf(home), `a stage with a live session was reaped — ${keeper.log()}`).toBeDefined();
    expect(keeper.child.hasExited()).toBe(false);

    unbindSessionFromBand(home, BAND, name);
    await expectEventually(
      () => rowOf(home) === undefined,
      () => `releasing the session did not free the band — ${keeper.log()}`,
    );
  });

  test("a CONNECTED CLIENT is an interaction: an established socket on the band holds the stage between table writes", async () => {
    const home = scratchHome("peer");
    const stage = await plantStage(home);
    plantRow(home, stage, EXPIRED_ISO);
    // A raw connection with no request — an http server keeps it ESTABLISHED while it waits for headers,
    // which is the same observable a driving browser's HMR socket presents. This process is the vitest
    // worker: not stage-rooted, so the probe must read it as a foreign peer.
    const socket = createConnection({ host: "127.0.0.1", port: stage.serverPort });
    openSockets.push(socket);
    await new Promise<void>((resolve) => socket.once("connect", resolve));

    const keeper = startKeeper(home);
    await sleep(TTL_MS * 2);
    expect(rowOf(home), `a stage with a client connected to its port was reaped — ${keeper.log()}`).toBeDefined();

    socket.destroy();
    openSockets.splice(openSockets.indexOf(socket), 1);
    await expectEventually(
      () => rowOf(home) === undefined,
      () => `closing the client did not free the band — ${keeper.log()}`,
    );
  });

  test("a STAGELESS run arms nothing and exits: `--file` leaves no keeper behind and does not hold its own event loop", async () => {
    const home = scratchHome("stageless");
    const fixture = join(home, "stageless.html");
    writeFileSync(fixture, '<!doctype html><html><body><button id="ok">okay</button></body></html>');
    const before = keeperProcessCount(home);

    // The real snap CLI, in the shape the `--file` suites use. `armStageKeeper` is reachable only from
    // `ensureStage`, which `configureStage` only reaches under `--isolated` — so a file run must allocate
    // no band, arm no timer, and above all EXIT: a detached child holding a pipe to this process would
    // keep its event loop referenced and turn every `--file` suite into a timeout.
    const startedAtMs = performance.now();
    const run = await spawnNiced(process.execPath, [SNAP_CLI, "--file", fixture, "--no-shot", "--no-deadcss", "--no-failure-evidence"], {
      // `spawnNiced` merges its `env` over the ambient one itself, so only the OVERRIDE goes here.
      env: Object.fromEntries([["ORB_SNAP_STAGE_HOME", home]]),
      timeoutMs: CASE_BUDGET_MS,
    });
    const elapsed = performance.now() - startedAtMs;

    expect(run.timedOut, `the CLI did not exit within ${CASE_BUDGET_MS}ms — ${run.stdout}${run.stderr}`).toBe(false);
    expect(run.code, run.stdout).toBe(0);
    expect(elapsed, "a stageless run must not sit at its budget waiting on a child").toBeLessThan(CASE_BUDGET_MS / 2);
    expect(readBands(home), "a `--file` run allocates no band").toEqual([]);
    expect(keeperProcessCount(home), "no idle timer was armed, so none can be left behind").toBe(before);

    // THE NEGATIVE CONTROL: a keeper for a DIFFERENT `ORB_SNAP_STAGE_HOME` — standing in for a sibling
    // lane's own live keeper — must never move THIS suite's attributable count, in either direction.
    const foreignHome = scratchHome("foreign");
    const foreignStage = await plantStage(foreignHome);
    plantRow(foreignHome, foreignStage, FRESH_ISO);
    const foreignKeeper = startKeeper(foreignHome);
    await expectEventually(
      () => keeperProcessCount(foreignHome) > 0,
      () => "the foreign keeper never armed — the control proves nothing",
    );
    expect(keeperProcessCount(home), "a keeper for a DIFFERENT home moved this suite's attributable count").toBe(before);
    foreignKeeper.child.killGroup("SIGKILL");

    // THE PLANTED CONTROL: arm one on purpose against a real row and the SAME assertion catches it — so
    // the zero above is a measurement, not an instrument that cannot see a keeper at all.
    const stage = await plantStage(home);
    plantRow(home, stage, FRESH_ISO);
    const planted = startKeeper(home);
    await expectEventually(
      () => keeperProcessCount(home) > before,
      () => "the control never armed — the counter cannot see a keeper",
    );
    planted.child.killGroup("SIGKILL");
    await expectEventually(
      () => keeperProcessCount(home) === before,
      () => "the killed control keeper is still counted",
    );
  });

  test("the timer NEVER targets the default stack: a row naming the dev pair is refused, exit 2, nothing touched", async () => {
    const home = scratchHome("reserved");
    const stage = await plantStage(home);
    const planted = plantRow(home, stage, EXPIRED_ISO, { serverPort: DEV_PORTS.server, vitePort: DEV_PORTS.vite });
    const stagePid = spawnedPid(stage.child);

    const keeper = startKeeper(home);
    await expectEventually(
      () => keeper.child.hasExited(),
      () => `the keeper never answered — ${keeper.log()}`,
    );
    expect(keeper.log()).toContain("STAGE KEEPER REFUSED");
    expect(keeper.log()).toContain(`:${DEV_PORTS.vite} (dev stack)`);
    expect(rowOf(home), "the refusal must leave the row exactly as it found it").toMatchObject({
      band: planted.band,
      serverPort: DEV_PORTS.server,
      vitePort: DEV_PORTS.vite,
    });
    expect(readStageReaps(home), "a refusal is not a reap").toEqual([]);
    expect(pidAlive(stagePid), "and it killed nothing").toBe(true);
  });
});
