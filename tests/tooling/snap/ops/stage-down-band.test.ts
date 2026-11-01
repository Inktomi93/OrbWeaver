// `--stage-down --band N` releases one band of the caller's checkout: a sibling band of the same owner keeps
// running, a band a live session still holds is refused, and a band another checkout owns is never reached.
// The per-row stop is injected, so no stage process is touched.

import { expect, test } from "@orb/testkit/tooling";
import { vi } from "vitest";
import { stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import type { StageBandView, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { teardownView } from "../../../../tooling/src/snap/ops/stage-status.ts";

const OWNER = "/work/lane-a";
const SIBLING = "/work/lane-b";
const NOW = Date.parse("2026-10-24T12:00:00Z");
const STAMP = new Date(NOW).toISOString();

function row(band: number, checkout = OWNER): StageRow {
  const ports = stageBandPorts(band);
  return {
    band,
    sha: "0123456789abcdef0123456789abcdef01234567",
    dir: `${checkout}/.cache/snap-stage/band-${String(band)}`,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout,
    ownerPid: 4242,
    startedAt: STAMP,
    lastUsedAt: STAMP,
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
  };
}

function view(stage: StageRow | null, band: number, over: Partial<StageBandView> = {}): StageBandView {
  return { band, row: stage, bandBound: stage !== null, bandIsStageRooted: stage !== null, healthy: true, liveSessions: [], ...over };
}

/** Walk the views the way `teardownStage` does and report which bands the injected stop was asked to release. */
function released(
  views: readonly StageBandView[],
  selection: { band: number | null; force: boolean; owner: string | null },
): { bands: number[]; lines: string[] } {
  const bands: number[] = [];
  const tearDown = vi.fn((_owner: string, _home: string, target: StageRow) => {
    bands.push(target.band);
    return `band ${String(target.band)}: tore down`;
  });
  const lines = views.flatMap((v) => teardownView({ owner: OWNER, home: "/home", view: v, verdict: "live", selection, nowMs: NOW, tearDown }));
  return { bands, lines };
}

test("--band N tears down that band and leaves a second band of the same checkout running", () => {
  const views = [view(row(1), 1), view(row(2), 2)];
  expect(released(views, { band: 1, force: false, owner: null }).bands).toEqual([1]);
  expect(released(views, { band: 2, force: false, owner: null }).bands).toEqual([2]);
});

test("no --band keeps the default: every band the caller owns", () => {
  const views = [view(row(1), 1), view(row(2), 2)];
  expect(released(views, { band: null, force: false, owner: null }).bands).toEqual([1, 2]);
});

test("a band with a live session is refused, and --force overrides the refusal", () => {
  const views = [view(row(1), 1, { liveSessions: ["review"] })];
  const refused = released(views, { band: 1, force: false, owner: null });
  expect(refused.bands).toEqual([]);
  expect(refused.lines).toEqual([expect.stringContaining("live session review")]);
  expect(released(views, { band: 1, force: true, owner: null }).bands).toEqual([1]);
});

test("--band never reaches a sibling's band", () => {
  const views = [view(row(1, SIBLING), 1)];
  expect(released(views, { band: 1, force: false, owner: null }).bands).toEqual([]);
});

test("--band selects one band for --stage-down and nothing else", () => {
  const down = parseSnapArgs(["--stage-down", "--band", "3"]);
  expect(down.errors).toEqual([]);
  expect(down.stageBand).toBe(3);
  expect(parseSnapArgs(["--band", "3"]).errors).not.toEqual([]);
  expect(parseSnapArgs(["--stage-down", "--band", "3", "--stage-owner", OWNER, "--force"]).errors).not.toEqual([]);
  expect(parseSnapArgs(["--stage-down", "--band", "99"]).errors).not.toEqual([]);
  expect(parseSnapArgs(["--stage-down", "--band", "x"]).errors).not.toEqual([]);
});
