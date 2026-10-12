// A session call is refused (exit 2) before it measures when the band no longer carries the stage the session
// bound at boot: the identity it persisted on its row is compared against the live band table.
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import { stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import type { SessionEvent, SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../../../../tooling/src/snap/contract/session.ts";
import type { StageBoundIdentity, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { readSessionEvent } from "../../../../tooling/src/snap/lib/session-wire.ts";
import { STAGE_ROOT_REL } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { refuseDriftedStageCall } from "../../../../tooling/src/snap/ops/session-daemon-request.ts";
import { writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";

const CHECKOUT = "/home/dev/orbweaver";
const BAND = 2;
const BOOTED = "2026-10-11T10:00:00.000Z";
const CLONE = { copiedFrom: "/box/prod.db", cloned: true as const, copiedAt: "2026-10-11T10:00:00.000Z", devDbMtimeAtCopy: "2026-10-11T09:00:00.000Z" };
const BOUND: StageBoundIdentity = { sha: "a".repeat(40), dir: `${CHECKOUT}/.cache/snap-stage/aaaaaaaaaaaa`, startedAt: BOOTED, dbProvenance: CLONE };

function stageHome(): string {
  const home = mkdtempSync(join(tmpdir(), "orb-session-drift-"));
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  return home;
}

function bandRow(over: Partial<StageRow> = {}): StageRow {
  const ports = stageBandPorts(BAND);
  return {
    band: BAND,
    ...BOUND,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: CHECKOUT,
    ownerPid: 4242,
    lastUsedAt: BOOTED,
    sessions: [],
    rsyncs: 0,
    ...over,
  };
}

function sessionRow(bound: StageBoundIdentity | undefined): SessionRow {
  return {
    v: SESSION_PROTOCOL_VERSION,
    name: "p-drift",
    ownerCheckout: CHECKOUT,
    daemonPid: process.pid,
    pgid: process.pid,
    socket: "/tmp/p-drift.sock",
    cdpEndpoint: null,
    slotDir: "/tmp/slot",
    binding: { kind: "stage", url: "http://localhost:5293" },
    stage: { band: BAND, status: "live", detectedAt: null, op: null, ...(bound === undefined ? {} : { bound }) },
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
    createdAt: BOOTED,
    lastUsedAt: BOOTED,
    inflightOp: null,
    lastOp: null,
    ttlMs: 60_000,
    headless: true,
    calls: 0,
  };
}

/** A socket stand-in that records the events a refusal writes. */
function sink(): {
  readonly socket: { destroyed: boolean; writable: boolean; write: (text: string) => void; end: () => void };
  readonly events: SessionEvent[];
} {
  const events: SessionEvent[] = [];
  return {
    socket: {
      destroyed: false,
      writable: true,
      write: (text): void => {
        const event = readSessionEvent(text);
        if (event === null) {
          throw new Error(`refusal wrote a line the client reader rejects: ${text}`);
        }
        events.push(event);
      },
      end: () => undefined,
    },
    events,
  };
}

function callAgainst(home: string, bound: StageBoundIdentity | undefined): { readonly refused: boolean; readonly events: SessionEvent[] } {
  const out = sink();
  const refused = refuseDriftedStageCall({ name: "p-drift", row: sessionRow(bound), stageHome: home }, { kind: "call" }, out.socket);
  return { refused, events: out.events };
}

test("a session call whose band was swapped to another database is refused with exit 2 before it measures", () => {
  const home = stageHome();
  writeRow(home, bandRow({ dbProvenance: null }));
  const { refused, events } = callAgainst(home, BOUND);
  expect(refused).toBe(true);
  expect(events.at(-1)).toEqual({ kind: "done", exit: EXIT.toolError, pairs: [] });
});

test("a session call against the stage it bound proceeds, and so does one with no recorded identity", () => {
  const home = stageHome();
  writeRow(home, bandRow({ lastUsedAt: "2026-10-11T11:00:00.000Z" }));
  expect(callAgainst(home, BOUND)).toEqual({ refused: false, events: [] });
  // A row an older daemon wrote has no identity to compare, and the death gate still owns its stage.
  const swapped = stageHome();
  writeRow(swapped, bandRow({ dbProvenance: null }));
  expect(callAgainst(swapped, undefined).refused).toBe(false);
});

test("a band with no row is left to the dead-stage gate, not reported as a swap", () => {
  expect(callAgainst(stageHome(), BOUND).refused).toBe(false);
});
