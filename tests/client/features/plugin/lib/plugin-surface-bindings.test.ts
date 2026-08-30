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
import {
  collectImageAssetIds,
  gridTiles,
  specBindsState,
  specNamesBundleAsset,
} from "../../../../../packages/client/src/features/plugin/lib/plugin-surface-bindings.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNED = castId<AssetId>("asset_01h455vb4pex5vsknk084sn02q");
const SPRITE = castId<AssetId>("asset_01h455vb4pex5vsknk084sn03r");
/** A plugin that shipped no `ui/assets/` images (#820) — the map every pre-bundle-arm spec resolves against. */
const NO_BUNDLE: ReadonlyMap<string, AssetId> = new Map();

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
    collectImageAssetIds(spec, state, NO_BUNDLE, out);
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
    collectImageAssetIds(spec, state, NO_BUNDLE, out);
    expect(out).toEqual([]);
  });

  test("#798: a detail-stage HERO joins the sweep through BOTH arms — a declared id and a bound cover resolve identically", () => {
    const spec: PluginSurfaceNode = {
      kind: "masterDetail",
      stages: [
        { id: "declared", kind: "detail", hero: { assetId: OWNED }, body: { kind: "text", value: "x" } },
        { id: "bound", kind: "detail", hero: { assetFrom: { $state: "cover" } }, body: { kind: "text", value: "y" } },
      ],
    };
    const out: AssetId[] = [];
    collectImageAssetIds(spec, { cover: OWNED }, NO_BUNDLE, out);
    expect(out).toEqual([OWNED, OWNED]);
    // A URL smuggled through the bound hero's state is format-gated out of the resolve set (the anti-exfil wall).
    const bad: AssetId[] = [];
    collectImageAssetIds(spec, { cover: "https://evil.example/x.png" }, NO_BUNDLE, bad);
    expect(bad).toEqual([OWNED]); // only the DECLARED hero's id; the bound one dropped by the format wall
  });
});

describe("#820 the BUNDLE arm — a path is a NAME, resolved against this plugin's own install-time map", () => {
  const bundle: ReadonlyMap<string, AssetId> = new Map([["ui/assets/happy.png", SPRITE]]);

  test("a bundleAsset path on an image, a tile and a hero each resolve to the SHIPPED id", () => {
    const spec: PluginSurfaceNode = {
      kind: "stack",
      children: [
        { kind: "image", bundleAsset: "ui/assets/happy.png" },
        { kind: "grid", tiles: [{ id: "t1", title: "One", bundleAsset: "ui/assets/happy.png" }] },
        {
          kind: "masterDetail",
          stages: [{ id: "d", kind: "detail", hero: { bundleAsset: "ui/assets/happy.png" }, body: { kind: "text", value: "x" } }],
        },
      ],
    };
    const out: AssetId[] = [];
    collectImageAssetIds(spec, {}, bundle, out);
    expect(out).toEqual([SPRITE, SPRITE, SPRITE]);
  });

  test("a path the plugin never shipped resolves to NOTHING — and never poisons the id set", () => {
    // The load-bearing arm: `resolveBlobRefs` validates its WHOLE input array against the TypeID schema, so a
    // raw path leaking into the set would fail the request and blank EVERY image on the surface. An unshipped
    // path must be a per-node placeholder instead — hence "collects nothing", not "collects the path".
    const spec: PluginSurfaceNode = {
      kind: "stack",
      children: [
        { kind: "image", bundleAsset: "ui/assets/never-shipped.png" },
        { kind: "image", assetId: OWNED },
      ],
    };
    const out: AssetId[] = [];
    collectImageAssetIds(spec, {}, bundle, out);
    expect(out).toEqual([OWNED]);
    expect(out.every((id) => id.startsWith("asset_"))).toBe(true);
  });

  test("the map has not landed yet ⇒ the bundle node contributes nothing, and the declared ids still resolve", () => {
    const spec: PluginSurfaceNode = {
      kind: "stack",
      children: [
        { kind: "image", bundleAsset: "ui/assets/happy.png" },
        { kind: "image", assetId: OWNED },
      ],
    };
    const out: AssetId[] = [];
    collectImageAssetIds(spec, {}, NO_BUNDLE, out);
    expect(out).toEqual([OWNED]);
  });

  test("specNamesBundleAsset gates the extra read — true for each of the three sites, false for a spec with none", () => {
    expect(specNamesBundleAsset({ kind: "image", bundleAsset: "ui/assets/a.png" })).toBe(true);
    expect(specNamesBundleAsset({ kind: "grid", tiles: [{ id: "t", title: "T", bundleAsset: "ui/assets/a.png" }] })).toBe(true);
    expect(
      specNamesBundleAsset({
        kind: "masterDetail",
        stages: [{ id: "d", kind: "detail", hero: { bundleAsset: "ui/assets/a.png" }, body: { kind: "text", value: "x" } }],
      }),
    ).toBe(true);
    // Nested through a container — the walk uses the shared child seam, so a buried node still counts.
    expect(specNamesBundleAsset({ kind: "stack", children: [{ kind: "stack", children: [{ kind: "image", bundleAsset: "ui/assets/a.png" }] }] })).toBe(true);
    // …and a spec with no bundle arm pays for no query.
    expect(specNamesBundleAsset({ kind: "stack", children: [{ kind: "image", assetId: OWNED }] })).toBe(false);
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

  test("#798: a masterDetail whose ONLY binding is a bound HERO counts as bound — its no-cover fallback never paints as room chrome", () => {
    const boundHero: PluginSurfaceNode = {
      kind: "masterDetail",
      stages: [{ id: "d", kind: "detail", hero: { assetFrom: { $state: "cover" } }, body: { kind: "text", value: "static" } }],
    };
    expect(specBindsState(boundHero)).toBe(true);
    // A DECLARED hero (no binding) stays static — nothing to wait for.
    const declaredHero: PluginSurfaceNode = {
      kind: "masterDetail",
      stages: [{ id: "d", kind: "detail", hero: { assetId: OWNED }, body: { kind: "text", value: "static" } }],
    };
    expect(specBindsState(declaredHero)).toBe(false);
  });
});
