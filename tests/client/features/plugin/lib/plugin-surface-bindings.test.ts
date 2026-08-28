// The pure binding seams behind the plugin-surface renderer (#774 ARM C receipts): the state-aware image
// sweep, the two-arm grid collapse, and the silence test's new binding arms. These are the CLIENT half of the
// bound-collection trust story — the contracts suite pins the resolvers' validation/clamping; this suite pins
// that the RENDER plumbing actually routes state-sourced ids through them (a sweep blind to a bound cover
// would mean the id never reaches the ONE owner-scoped `resolveBlobRefs` read, and the tile silently never
// paints — or worse, a future sweep bypass would skip the format wall).

import type { PluginSurfaceNode } from "@orb/contracts/plugin";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { collectImageAssetIds, gridTiles, specBindsState } from "../../../../../packages/client/src/features/plugin/lib/plugin-surface-bindings.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNED = castId<AssetId>("asset_01h455vb4pex5vsknk084sn02q");

describe("collectImageAssetIds (state-aware, ARM C)", () => {
  test("collects declared ids AND state-bound ids — a bound cover joins the same owner-scoped resolve", () => {
    const spec: PluginSurfaceNode = {
      kind: "stack",
      children: [
        { kind: "image", assetId: OWNED },
        { kind: "image", assetFrom: { $state: "detail.cover" } },
        { kind: "grid", tilesFrom: { $state: "results" }, tileAction: "open" },
      ],
    };
    const state = { detail: { cover: OWNED }, results: [{ id: "r1", title: "One", assetId: OWNED }] };
    const out: AssetId[] = [];
    collectImageAssetIds(spec, state, out);
    expect(out).toEqual([OWNED, OWNED, OWNED]);
  });

  test("a bound value that is NOT a well-formed asset id never enters the resolve set — the format wall holds in the sweep", () => {
    const spec: PluginSurfaceNode = {
      kind: "stack",
      children: [
        { kind: "image", assetFrom: { $state: "cover" } },
        { kind: "grid", tilesFrom: { $state: "results" } },
      ],
    };
    // A URL, a foreign-prefix id, and a malformed tile entry: none may reach `resolveBlobRefs` — an id that
    // never enters the set can never resolve, which is the fail-closed half of the no-paint receipt (the
    // OWNERSHIP half lives in the server's owner-scoped resolve, whose miss paints the placeholder).
    const state = { cover: "https://evil.example/x.png", results: [{ id: "r1", title: "t", assetId: "chat_01h455vb4pex5vsknk084sn02q" }] };
    const out: AssetId[] = [];
    collectImageAssetIds(spec, state, out);
    expect(out).toEqual([]);
  });
});

describe("gridTiles (the two-arm collapse)", () => {
  test("declared tiles pass through verbatim; the bound arm resolves against state", () => {
    const declared: Extract<PluginSurfaceNode, { kind: "grid" }> = { kind: "grid", tiles: [{ id: "a1", title: "One", actionId: "open" }] };
    expect(gridTiles(declared, {})).toEqual([{ id: "a1", title: "One", actionId: "open" }]);
    const bound: Extract<PluginSurfaceNode, { kind: "grid" }> = { kind: "grid", tilesFrom: { $state: "results" }, tileAction: "open" };
    expect(gridTiles(bound, { results: [{ id: "r1", title: "The Storm" }] })).toEqual([{ id: "r1", title: "The Storm" }]);
    // A bound grid before its state lands is EMPTY, not broken — the grid renders its `empty` line.
    expect(gridTiles(bound, {})).toEqual([]);
  });
});

describe("specBindsState (the §4.9 silence test learns the new arms)", () => {
  test("a tilesFrom grid and an assetFrom image each count as BOUND — a room mount withholds them until state lands", () => {
    expect(specBindsState({ kind: "grid", tilesFrom: { $state: "results" } })).toBe(true);
    expect(specBindsState({ kind: "image", assetFrom: { $state: "cover" } })).toBe(true);
    // …and the declared arms stay static, exactly as before the widening.
    expect(specBindsState({ kind: "grid", tiles: [{ id: "a1", title: "One" }] })).toBe(false);
    expect(specBindsState({ kind: "image", assetId: OWNED })).toBe(false);
  });
});
