// Unit: the Actions-tab row model's IA half (features/preset/lib/template-rows — the Actions-tab IA §2.1/§2.2).
// The pure derivations the CT proves only by rendering: the flat/cluster PARTITION (a row renders under its
// declared band, in tuple order, and nowhere twice), the filter's match-and-prune (groups and bands with no
// matches vanish; matching is over the two VISIBLE strings), and the chrome-copy Records' behavioral floor
// (a label the tuple declares but nobody wrote would band a cluster with an empty kicker).

import { TEMPLATE_CLUSTERS, TEMPLATE_DEFS, TEMPLATE_KINDS } from "@orb/contracts/preset";
import {
  TEMPLATE_CLUSTER_LABEL,
  TEMPLATE_KIND_DELIVERY,
  templateGroups,
  templateRowById,
  templateRowMatches,
} from "../../../../../packages/client/src/features/preset/lib/template-rows.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("the partition is TOTAL and disjoint: every registry def lands exactly once, flat or banded", () => {
  const groups = templateGroups();
  const seen = groups.flatMap((group) => [...group.rows.map((row) => row.def.id), ...group.clusters.flatMap((c) => c.rows.map((row) => row.def.id))]);
  expect(seen.toSorted()).toStrictEqual(TEMPLATE_DEFS.map((def) => def.id).toSorted());
  expect(new Set(seen).size).toBe(seen.length);
  // Group order is the KINDS tuple's; band order is the CLUSTERS tuple's — the registry's own vocabulary
  // orders the list, never an alphabetize or a hand-sort.
  const kindOrder = groups.map((group) => group.kind);
  expect(kindOrder).toStrictEqual(TEMPLATE_KINDS.filter((kind) => kindOrder.includes(kind)));
  for (const group of groups) {
    const bandOrder = group.clusters.map((cluster) => cluster.id);
    expect(bandOrder).toStrictEqual(TEMPLATE_CLUSTERS.filter((id) => bandOrder.includes(id)));
  }
});

test("only the extract group bands; every band wears a non-empty label from the one label Record", () => {
  const groups = templateGroups();
  // Stated as two set-shaped assertions rather than a branch per group (noConditionalExpect): the extract
  // group is entirely banded, and no other group bands at all.
  const extract = groups.find((group) => group.kind === "extract");
  expect(extract?.rows).toStrictEqual([]);
  expect(extract?.clusters.length).toBeGreaterThan(0);
  expect(groups.filter((group) => group.kind !== "extract").flatMap((group) => group.clusters)).toStrictEqual([]);
  for (const cluster of groups.flatMap((group) => group.clusters)) {
    expect(cluster.label).toBe(TEMPLATE_CLUSTER_LABEL[cluster.id]);
    expect(cluster.label.length).toBeGreaterThan(0);
  }
});

test("the filter matches label OR fires, case-insensitively, and blank matches everything", () => {
  const weather = templateRowById("rpg.extract.scene.weather");
  if (weather === undefined) {
    throw new Error("the weather row left the registry");
  }
  expect(templateRowMatches(weather, "")).toBe(true);
  expect(templateRowMatches(weather, "   ")).toBe(true);
  expect(templateRowMatches(weather, "WEATHER")).toBe(true); // the label
  expect(templateRowMatches(weather, "the sky")).toBe(true); // the fires gloss
  expect(templateRowMatches(weather, "impersonate")).toBe(false);
});

test("a filtered walk prunes empty groups and empty bands — never a kicker over nothing", () => {
  const groups = templateGroups("weather");
  // Exactly the groups holding a match survive. "weather" hits the scene row's label plus the two tool rows
  // whose fires mention it ({{weatherTypes}} carriers) — the point is the PRUNE, not the exact census:
  for (const group of groups) {
    const rows = [...group.rows, ...group.clusters.flatMap((cluster) => cluster.rows)];
    expect(rows.length).toBeGreaterThan(0);
    for (const cluster of group.clusters) {
      expect(cluster.rows.length).toBeGreaterThan(0);
    }
    for (const row of rows) {
      expect(templateRowMatches(row, "weather")).toBe(true);
    }
  }
  // A no-match filter yields NO groups (the view renders its stated empty condition instead).
  expect(templateGroups("zzzz-no-such-template")).toStrictEqual([]);
});

test("the delivery dispatch: the guided family rides the marker; every static arm states channel + body", () => {
  expect(TEMPLATE_KIND_DELIVERY.steer.kind).toBe("marker");
  expect(TEMPLATE_KIND_DELIVERY.voice.kind).toBe("marker");
  expect(TEMPLATE_KIND_DELIVERY.studio.kind).toBe("marker");
  for (const kind of ["nudge", "format", "group", "teach", "extract"] as const) {
    const delivery = TEMPLATE_KIND_DELIVERY[kind];
    // Narrowed by expression, not a branch (noConditionalExpect): a marker-armed kind fails the first
    // assertion, and the copy assertions fail on `undefined` rather than passing vacuously.
    const arm = delivery.kind === "static" ? delivery : undefined;
    expect(arm?.kind).toBe("static");
    expect(arm?.channel.length).toBeGreaterThan(0);
    expect(arm?.body.length).toBeGreaterThan(0);
  }
});
