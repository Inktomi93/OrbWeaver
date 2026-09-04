import { join } from "node:path";
import process from "node:process";
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../../../../tooling/src/snap/contract/session.ts";
import type { StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { touchSessionHeartbeat } from "../../../../tooling/src/snap/ops/session-heartbeat.ts";
import { readRow, writeRow } from "../../../../tooling/src/snap/ops/session-registry.ts";
import { readBands, writeBands } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const OLD = "2026-09-03T10:00:00.000Z";
const NOW = "2026-09-03T10:05:00.000Z";

test("one heartbeat stamps the session row and its bound stage row to the same instant", async ({ plantedTree }) => {
  const root = await plantedTree({ "sessions/.keep": "", "stages/.keep": "" });
  const home = join(root, "sessions");
  const stageHome = join(root, "stages");
  const session: SessionRow = {
    v: SESSION_PROTOCOL_VERSION,
    name: "p-heartbeat",
    ownerCheckout: root,
    daemonPid: process.pid,
    pgid: process.pid,
    socket: join(home, "p-heartbeat.sock"),
    cdpEndpoint: "http://127.0.0.1:9222",
    slotDir: join(root, "slot"),
    binding: { kind: "stage", url: "http://127.0.0.1:5273" },
    stage: { band: 0, status: "live", detectedAt: null, op: null },
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
    createdAt: OLD,
    lastUsedAt: OLD,
    inflightOp: null,
    lastOp: null,
    ttlMs: 60_000,
    headless: true,
    calls: 0,
  };
  const stage: StageRow = {
    band: 0,
    serverPort: 8888,
    vitePort: 5273,
    sha: "dirty",
    dir: root,
    checkout: root,
    ownerPid: process.pid,
    startedAt: OLD,
    lastUsedAt: OLD,
    sessions: [session.name],
    dbProvenance: null,
    rsyncs: 0,
  };
  writeRow(home, session);
  writeBands(stageHome, [stage]);
  const state = { home, stageHome, stageBand: 0, row: session };
  touchSessionHeartbeat(state, {}, NOW);
  expect(readRow(home, session.name)?.lastUsedAt).toBe(NOW);
  expect(readBands(stageHome)[0]?.lastUsedAt).toBe(NOW);
});
