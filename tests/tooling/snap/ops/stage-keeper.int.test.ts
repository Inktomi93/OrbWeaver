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
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Socket } from "node:net";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { REPO_ROOT } from "@orb/tooling/_shared/artifacts";
import { DEV_PORTS } from "@orb/tooling/_shared/ports";
import type { NicedChild } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv, spawnNicedChild } from "@orb/tooling/_shared/proc";
import type { StageRow } from "@orb/tooling/snap";
import { readBands, readStageReaps } from "@orb/tooling/snap";
import { afterEach, describe, expect, test, vi } from "vitest";
// The table's WRITERS are not front-door members (the door exports the readers a sibling tool needs), so
// this proof reaches them at their source path — the spelling tests/tooling/snap/ops/stage-marker.int.test.ts
// already uses for the same modules.
import { bindSessionToBand, touchRow, unbindSessionFromBand, writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";
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
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
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
    startedAt: new Date(Date.now() - idleMs).toISOString(),
    lastUsedAt: new Date(Date.now() - idleMs).toISOString(),
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    ...over,
  };
  writeRow(home, row);
  return row;
}

function startKeeper(home: string): { readonly child: NicedChild; readonly log: () => string } {
  let output = "";
  const child = spawnNicedChild(process.execPath, [SNAP_CLI, "--stage-keeper", String(BAND)], {
    cwd: REPO_ROOT,
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
    onOutput: (chunk) => {
      output += chunk.toString();
    },
  });
  started.push(child);
  return { child, log: () => output };
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

/** The session-registry row a live daemon writes — `daemonPid` is THIS process, so `liveSessionNames`
 *  answers "alive" against a pid that genuinely exists rather than a number that happens to be free. */
function writeLiveSessionRow(home: string, name: string): void {
  const now = new Date().toISOString();
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
      touchRow(home, BAND, new Date().toISOString());
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
    bindSessionToBand(home, BAND, name, new Date().toISOString());
    touchRow(home, BAND, new Date(Date.now() - 10 * 60_000).toISOString());

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
