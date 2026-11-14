// @instrument-proof: the `map=` / `map-dom-fallbacks=` RESULT pairs count EVERY page's rows. Reading the
//   first outcome that carried a map made a multi-page run print one page's population as the run's, so a
//   reader comparing the RESULT line against the emitted fact saw two different numbers for one run
//   (#1509) — and the smaller one looked like a smaller surface, not like a truncated count.
// @instrument-absence-proof: with `--map` off, and with the flag on but every page failing to capture,
//   the pairs stay "no"/"0" rather than borrowing a neighbour's population.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { beginInstrumentRun, finishInstrumentRun } from "../../../../../tooling/src/floor/artifacts/artifact-out.ts";
import { installOutputSink } from "../../../../../tooling/src/floor/cli/log.ts";
import { PRIVATE_MASK } from "../../../../../tooling/src/snap/contract/disk-safe-argv.ts";
import type { MapEntry } from "../../../../../tooling/src/snap/contract/map.ts";
import type { CaptureOutcome } from "../../../../../tooling/src/snap/contract/types.ts";
import { noteUrlSecrets } from "../../../../../tooling/src/snap/lib/disk-safe-argv.ts";
import { printMapBlock } from "../../../../../tooling/src/snap/lib/map-report.ts";
import { forgetPrivateValues } from "../../../../../tooling/src/snap/lib/private-values.ts";
import { MAP_ARM } from "../../../../../tooling/src/snap/ops/arms/map.ts";
import { mapAtlasEvidence } from "../../../../../tooling/src/snap/ops/page-validate.ts";
import { parseSnapArgs } from "../../../../../tooling/src/snap/ops/parse.ts";

function entry(source: MapEntry["source"]): MapEntry {
  return {
    role: "button",
    name: "Save",
    selector: '[data-fixture="save"]',
    state: { disabled: null, current: null, checked: null, expanded: null },
    visibility: "visible",
    inactiveReason: null,
    actionability: "actionable",
    source,
  };
}

function outcome(pageIndex: number, mapResult: MapEntry[] | null): CaptureOutcome {
  return {
    pageIndex,
    navError: null,
    stepFailures: 0,
    navFailures: 0,
    driveFailures: [],
    fileActions: [],
    heap: null,
    deadCss: [],
    emptyCss: [],
    deadCssEvidence: null,
    ariaText: null,
    ariaError: null,
    evalResults: [],
    contrastResults: [],
    contrastEvidence: [],
    mapResult,
    mapError: null,
    mapAtlas: null,
    mapAtlasError: null,
    mapShell: null,
    mapShellError: null,
    assertions: [],
    perf: null,
    cssEvidence: null,
    evidenceRange: null,
    themeStampGap: null,
  };
}

function pairsFor(outcomes: readonly CaptureOutcome[], argv: readonly string[]): Record<string, string> {
  const opts = parseSnapArgs(["/x", ...argv]);
  const pairs = MAP_ARM.lifecycle.pairs({
    opts,
    outcomes,
    ctx: { url: "/x", out: "reports/snaps/x.png", produceShot: true, failed: [], totalPages: outcomes.length },
  });
  return Object.fromEntries(pairs.map(([key, value]) => [key, String(value)]));
}

test("the map RESULT pairs count every page, not the first page that captured one", () => {
  const outcomes = [outcome(0, [entry("semantic"), entry("dom")]), outcome(1, [entry("semantic"), entry("semantic"), entry("dom")])];

  // 5 rows over two pages, 2 of them DOM fallbacks. Before the fix this read map=2 / fallbacks=1.
  expect(pairsFor(outcomes, ["--map"])).toMatchObject({ map: "5", "map-dom-fallbacks": "2" });
});

test("a page that captured nothing contributes nothing rather than hiding a later page's rows", () => {
  const outcomes = [outcome(0, null), outcome(1, [entry("semantic")])];

  expect(pairsFor(outcomes, ["--map"])).toMatchObject({ map: "1", "map-dom-fallbacks": "0" });
});

const MAP_CANARY = "map-canary-token-5d6e7f";

// The atlas as the map bridge script returns it: `url` and `place.url` are the page's own `location.href`.
function bridgeAtlas(href: string): unknown {
  return {
    status: "available",
    url: href,
    capabilities: {
      sections: ["Home", "Chats"],
      modalSlots: ["newChat"],
      configGroups: ["appearance"],
      contextTabs: ["rpg.game"],
      contextTabNames: [{ id: "rpg.game", label: "Game" }],
      contextTabsPublished: true,
      chatPositions: ["latest"],
    },
    place: { url: href, section: "Chats", chatOpen: false },
  };
}

test("the atlas page URL loses a noted token in the printed atlas and in the map evidence file", async ({ plantedTree }) => {
  forgetPrivateValues();
  using _forget = { [Symbol.dispose]: forgetPrivateValues };
  const href = `http://127.0.0.1:5173/chats?token=${MAP_CANARY}`;
  noteUrlSecrets(href);
  const opts = parseSnapArgs(["/chats", "--map", "--atlas"]);
  // The validator the map arm reads the bridge through, where the page's text enters snap.
  const captured: CaptureOutcome = { ...outcome(0, null), mapAtlas: mapAtlasEvidence(bridgeAtlas(href)) };

  const lines: string[] = [];
  const release = installOutputSink({ line: (text) => lines.push(text), warn: (text) => lines.push(text) });
  try {
    printMapBlock({
      opts,
      atlas: captured.mapAtlas,
      atlasError: captured.mapAtlasError,
      shell: captured.mapShell,
      shellError: captured.mapShellError,
      entries: captured.mapResult,
      surfaceError: captured.mapError,
    });
  } finally {
    release();
  }
  const printed = lines.join("\n");
  expect(printed).toContain(`token=${PRIVATE_MASK}`);
  expect(printed).not.toContain(MAP_CANARY);

  const root = await plantedTree({ "reports/.keep": "" });
  beginInstrumentRun("snap", root);
  try {
    await MAP_ARM.lifecycle.evidence(
      { opts, outcomes: [captured], ctx: { url: href, out: "reports/snaps/chats.png", produceShot: true, failed: [], totalPages: 1 } },
      "chats",
    );
  } finally {
    finishInstrumentRun();
  }
  // The run slot's file and the published `reports/evidence/` pointer to it.
  const written = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith("map.json"));
  expect(written.length).toBeGreaterThan(0);
  for (const path of written) {
    const evidence = readFileSync(join(root, path), "utf8");
    expect(evidence).toContain(`token=${PRIVATE_MASK}`);
    expect(evidence).not.toContain(MAP_CANARY);
  }
});

test("with --map off the pairs say so, and with it on over an empty population they say zero", () => {
  expect(pairsFor([outcome(0, null)], [])).toMatchObject({ map: "no", "map-dom-fallbacks": "no" });
  expect(pairsFor([outcome(0, null)], ["--map"])).toMatchObject({ map: "0", "map-dom-fallbacks": "0" });
});
