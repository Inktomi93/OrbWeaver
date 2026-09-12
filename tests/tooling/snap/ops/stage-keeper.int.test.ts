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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Socket } from "node:net";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { REPO_ROOT } from "@orb/tooling/_shared/artifacts";
import { DEV_PORTS } from "@orb/tooling/_shared/ports";
import type { NicedChild } from "@orb/tooling/_shared/proc";
import { runNicedSync, spawnNiced, spawnNicedChild } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import type { StageRow } from "@orb/tooling/snap";
import { readBands, readStageReaps, stageKeeperLogPath } from "@orb/tooling/snap";
import { afterEach, describe, vi } from "vitest";
// The table's WRITERS are not front-door members (the door exports the readers a sibling tool needs), so
// this proof reaches them at their source path — the spelling tests/tooling/snap/ops/stage-marker.int.test.ts
// already uses for the same modules.
import { bindSessionToBand, touchRow, unbindSessionFromBand, writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
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

// WALL CLOCK, deliberately, and through ONE door: the subject of every arm below is a SPAWNED keeper's elapsed
// real time against its TTL, and a child process has no injectable clock — so every row stamp and every
// deadline this file writes must be measured on the clock the keeper reads. Nothing else here reads time.
// @orb-waive test-determinism(Date.now): the SUBJECT is a spawned keeper's elapsed real time against its TTL — a child process has no injectable clock, and every stamp and deadline here must share its wall clock
const wallNowMs = (): number => Date.now();
/** The same instant as the ISO stamp the band table stores. */
const wallNowIso = (): string => new Date(wallNowMs()).toISOString();

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
  mkdirSync(join(home, ".cache", "snap-stage"), { recursive: true });
  mkdirSync(join(home, "sessions"), { recursive: true });
  return home;
}

async function until(predicate: () => boolean, budgetMs: number): Promise<boolean> {
  const deadline = wallNowMs() + budgetMs;
  while (wallNowMs() < deadline) {
    if (predicate()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return predicate();
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
  await until(() => /READY \d+ \d+/u.test(output), CASE_BUDGET_MS);
  const ports = /READY (\d+) (\d+)/u.exec(output);
  if (ports === null) {
    // A refusal, not an assertion: this runs outside a test body, where a failed `expect` is invisible.
    throw new Error(`the planted stage never bound both ports: ${output}`);
  }
  return { child, dir, serverPort: Number(ports[1]), vitePort: Number(ports[2]) };
}

function plantRow(home: string, stage: PlantedStage, idleMs: number, over: Partial<StageRow> = {}): StageRow {
  const row: StageRow = {
    band: BAND,
    sha: SHA,
    dir: stage.dir,
    serverPort: stage.serverPort,
    vitePort: stage.vitePort,
    checkout: home,
    ownerPid: stage.child.pid ?? null,
    startedAt: new Date(wallNowMs() - idleMs).toISOString(),
    lastUsedAt: new Date(wallNowMs() - idleMs).toISOString(),
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

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** How many `--stage-keeper` processes tracing THIS SUITE's own `home` exist on the box right now.
 *  Counted by argv+env rather than by the table, because the property under test is about PROCESSES a
 *  run may leave behind, not about rows — and `ps` is the only thing that can see a child whose row was
 *  never written. Filtered to `home` because `--stage-keeper <band>` (the argv) carries no home — a
 *  box-global count would have a SIBLING lane's own live keeper move this suite's delta either way. Each
 *  candidate's `/proc/<pid>/environ` is read to confirm it inherited THIS home — the same `/proc` fence
 *  `pidIsStageRooted` (ops/stage-probe.ts) uses for cwd, so a keeper started elsewhere never counts here. */
function keeperProcessCount(home: string): number {
  // Through the house subprocess door (`_shared/proc.ts`), like every other `ps` read in this tree — it
  // carries the nice-19 floor and never throws, so a non-zero status reads as the zero this counter
  // reports. A proof that cannot enumerate processes has already failed its own planted control.
  const candidates = runNicedSync("ps", ["-eo", "pid,args="])
    .stdout.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("--stage-keeper"));
  let count = 0;
  for (const line of candidates) {
    const pid = Number.parseInt(line, 10);
    if (!Number.isInteger(pid)) {
      continue;
    }
    const environ = runNicedSync("cat", [`/proc/${pid}/environ`]);
    if (environ.status === 0 && environ.stdout.includes(`ORB_SNAP_STAGE_HOME=${home}`)) {
      count += 1;
    }
  }
  return count;
}

/** The session-registry row a live daemon writes — `daemonPid` is THIS process, so `liveSessionNames`
 *  answers "alive" against a pid that genuinely exists rather than a number that happens to be free. */
function writeLiveSessionRow(home: string, name: string): void {
  const now = wallNowIso();
  writeFileSync(
    join(home, "sessions", `${name}.json`),
    JSON.stringify({
      v: 1,
      name,
      ownerCheckout: home,
      daemonPid: process.pid,
      pgid: process.pid,
      socket: "/tmp/cbst.sock",
      cdpEndpoint: null,
      slotDir: "/tmp/slot",
      binding: { kind: "stage", url: "http://127.0.0.1:1" },
      environment: {
        viewport: { width: 1280, height: 720 },
        device: null,
        colorScheme: null,
        reducedMotion: false,
        contrast: null,
        reducedTransparency: false,
        deviceScaleFactor: null,
      },
      bootArgv: [],
      createdAt: now,
      lastUsedAt: now,
      inflightOp: null,
      lastOp: null,
      ttlMs: 1_800_000,
      headless: true,
      calls: 0,
    }),
  );
}

describe("the stage's own idle timer", () => {
  test("an idle stage tears ITSELF down: process group dead, row cleared, one log line, ledger arm `timer`", async () => {
    const home = scratchHome("reap");
    const stage = await plantStage(home);
    plantRow(home, stage, 10 * 60_000);
    const stagePid = stage.child.pid as number;
    // The control that makes "dead" mean something: it is alive, and nothing but the timer runs here.
    expect(pidAlive(stagePid), "the planted stage is running before the timer fires").toBe(true);

    const keeper = startKeeper(home);

    // The DEFECT the pin proves, asserted first and through the table rather than through the new API:
    // nobody asks for this band, nobody sweeps, and the stage must still be gone.
    expect(await until(() => rowOf(home) === undefined, CASE_BUDGET_MS), `band ${BAND}'s row was never cleared — ${keeper.log()}`).toBe(true);
    expect(await until(() => !pidAlive(stagePid), CASE_BUDGET_MS), "the stage's process group outlived its own timer").toBe(true);

    expect(await until(() => keeper.child.hasExited(), CASE_BUDGET_MS)).toBe(true);
    expect(keeper.log()).toContain(`TIMER REAPED band ${BAND}`);
    expect(keeper.log()).toContain("no live session and no connected client");
    const reaps = readStageReaps(home);
    expect(reaps.at(-1)).toMatchObject({ band: BAND, arm: "timer", checkout: home });
  });

  test("an interaction re-arms it — the stage survives 2x the window, then the same timer reaps once the interactions stop", async () => {
    const home = scratchHome("rearm");
    const stage = await plantStage(home);
    plantRow(home, stage, 0);
    const keeper = startKeeper(home);

    // Six stamps at a third of the window each: >2x the TTL of continuous survival, and every stamp is the
    // production heartbeat (`touchRow`) that `ensureStage`, a session call and an attached run all write.
    for (let beat = 0; beat < 6; beat += 1) {
      await sleep(TTL_MS / 3);
      touchRow(home, BAND, wallNowIso());
      expect(rowOf(home), `the timer reaped a stage that was used ${TTL_MS / 3}ms ago (beat ${beat}) — ${keeper.log()}`).toBeDefined();
    }
    expect(keeper.child.hasExited(), "the keeper must still be waiting, not dead").toBe(false);

    // The positive control: stop stamping and the SAME keeper reaps, so the survival above was a decision.
    expect(await until(() => rowOf(home) === undefined, CASE_BUDGET_MS), `the re-armed timer never fired — ${keeper.log()}`).toBe(true);
    expect(keeper.log()).toContain(`TIMER REAPED band ${BAND}`);
  });

  test("a LIVE session ref blocks the timer whatever the idle age; unbinding it lets the same timer fire", async () => {
    const home = scratchHome("session");
    const stage = await plantStage(home);
    plantRow(home, stage, 10 * 60_000);
    const name = "p-cbst-keeper";
    writeLiveSessionRow(home, name);
    // Binding is itself an interaction and stamps the heartbeat, so re-age the row: the ONLY thing that
    // can save it now is the session ref.
    bindSessionToBand(home, BAND, name, wallNowIso());
    touchRow(home, BAND, new Date(wallNowMs() - 10 * 60_000).toISOString());

    const keeper = startKeeper(home);
    await sleep(TTL_MS * 2);
    expect(rowOf(home), `a stage with a live session was reaped — ${keeper.log()}`).toBeDefined();
    expect(keeper.child.hasExited()).toBe(false);

    unbindSessionFromBand(home, BAND, name);
    expect(await until(() => rowOf(home) === undefined, CASE_BUDGET_MS), `releasing the session did not free the band — ${keeper.log()}`).toBe(true);
  });

  test("a CONNECTED CLIENT is an interaction: an established socket on the band holds the stage between table writes", async () => {
    const home = scratchHome("peer");
    const stage = await plantStage(home);
    plantRow(home, stage, 10 * 60_000);
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
    expect(await until(() => rowOf(home) === undefined, CASE_BUDGET_MS), `closing the client did not free the band — ${keeper.log()}`).toBe(true);
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
    const startedAtMs = wallNowMs();
    const run = await spawnNiced(process.execPath, [SNAP_CLI, "--file", fixture, "--no-shot", "--no-deadcss", "--no-failure-evidence"], {
      // `spawnNiced` merges its `env` over the ambient one itself, so only the OVERRIDE goes here.
      env: Object.fromEntries([["ORB_SNAP_STAGE_HOME", home]]),
      timeoutMs: CASE_BUDGET_MS,
    });
    const elapsed = wallNowMs() - startedAtMs;

    expect(run.timedOut, `the CLI did not exit within ${CASE_BUDGET_MS}ms — ${run.stdout}${run.stderr}`).toBe(false);
    expect(run.code, run.stdout).toBe(0);
    expect(elapsed, "a stageless run must not sit at its budget waiting on a child").toBeLessThan(CASE_BUDGET_MS / 2);
    expect(readBands(home), "a `--file` run allocates no band").toEqual([]);
    expect(keeperProcessCount(home), "no idle timer was armed, so none can be left behind").toBe(before);

    // THE NEGATIVE CONTROL: a keeper for a DIFFERENT `ORB_SNAP_STAGE_HOME` — standing in for a sibling
    // lane's own live keeper — must never move THIS suite's attributable count, in either direction.
    const foreignHome = scratchHome("foreign");
    const foreignStage = await plantStage(foreignHome);
    plantRow(foreignHome, foreignStage, 0);
    const foreignKeeper = startKeeper(foreignHome);
    expect(await until(() => keeperProcessCount(foreignHome) > 0, CASE_BUDGET_MS), "the foreign keeper never armed — the control proves nothing").toBe(true);
    expect(keeperProcessCount(home), "a keeper for a DIFFERENT home moved this suite's attributable count").toBe(before);
    foreignKeeper.child.killGroup("SIGKILL");

    // THE PLANTED CONTROL: arm one on purpose against a real row and the SAME assertion catches it — so
    // the zero above is a measurement, not an instrument that cannot see a keeper at all.
    const stage = await plantStage(home);
    plantRow(home, stage, 0);
    const planted = startKeeper(home);
    expect(await until(() => keeperProcessCount(home) > before, CASE_BUDGET_MS), "the control never armed — the counter cannot see a keeper").toBe(true);
    planted.child.killGroup("SIGKILL");
    expect(await until(() => keeperProcessCount(home) === before, CASE_BUDGET_MS)).toBe(true);
  });

  test("the timer NEVER targets the default stack: a row naming the dev pair is refused, exit 2, nothing touched", async () => {
    const home = scratchHome("reserved");
    const stage = await plantStage(home);
    const planted = plantRow(home, stage, 10 * 60_000, { serverPort: DEV_PORTS.server, vitePort: DEV_PORTS.vite });
    const stagePid = stage.child.pid as number;

    const keeper = startKeeper(home);
    expect(await until(() => keeper.child.hasExited(), CASE_BUDGET_MS), `the keeper never answered — ${keeper.log()}`).toBe(true);
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
