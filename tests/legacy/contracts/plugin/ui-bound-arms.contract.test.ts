// Contract tests for @orb/contracts/plugin/ui — the bound-collection and bound-vocabulary arms.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  PLUGIN_GRID_TILES_MAX,
  PLUGIN_ROWS_MAX,
  PLUGIN_TILE_TAGS_MAX,
  pluginBoundGridTileSchema,
  pluginSurfaceSpecSchema,
  resolvePluginBoundAssetId,
  resolvePluginBoundKeyValueRows,
  resolvePluginBoundSelectOptions,
  resolvePluginBoundTiles,
} from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// ── #774 ARM C — the BOUND-collection arms (`grid.tilesFrom` + `tileAction`, `image.assetFrom`) ─────────────

test("ARM C: a grid names exactly one of `tiles` / `tilesFrom`, and `tileAction` belongs to the bound arm", () => {
  const bound: PluginSurfaceSpec = { kind: "grid", tilesFrom: { $state: "results" }, tileAction: "open", empty: "Search to begin." };
  expect(pluginSurfaceSpecSchema.safeParse(bound).success).toBe(true);
  // Declared stays valid untouched (the append-only condition, regression-pinned).
  const declared: PluginSurfaceSpec = { kind: "grid", tiles: [{ id: "a1", title: "One" }] };
  expect(pluginSurfaceSpecSchema.safeParse(declared).success).toBe(true);
  // BOTH arms is two descriptions of one grid; NEITHER is a grid with nothing to show and no binding to wait
  // for; `tileAction` beside declared tiles is a claim the renderer would never honour (declared tiles carry
  // their own per-tile actionId).
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid", tiles: [{ id: "a1", title: "One" }], tilesFrom: { $state: "results" } }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid", tiles: [{ id: "a1", title: "One" }], tileAction: "open" }).success).toBe(false);
});

test("hub v1.2: tile `tags` ride BOTH arms count-capped, and a live select declares its `actionId`", () => {
  // Declared arm: tags accepted up to the cap; one past it refused (a chip row is a scent, not a dump).
  const tags = (n: number): string[] => Array.from({ length: n }, (_unused, i) => `tag${i}`);
  const declared = (n: number): unknown => ({ kind: "grid", tiles: [{ id: "a1", title: "One", tags: tags(n) }] });
  expect(pluginSurfaceSpecSchema.safeParse(declared(PLUGIN_TILE_TAGS_MAX)).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(declared(PLUGIN_TILE_TAGS_MAX + 1)).success).toBe(false);
  // Bound arm (published state, judged at RESOLVE): same cap — an over-cap entry is DROPPED, never fatal.
  expect(pluginBoundGridTileSchema.safeParse({ id: "r0", title: "Aria", tags: tags(PLUGIN_TILE_TAGS_MAX) }).success).toBe(true);
  expect(pluginBoundGridTileSchema.safeParse({ id: "r0", title: "Aria", tags: tags(PLUGIN_TILE_TAGS_MAX + 1) }).success).toBe(false);
  // The LIVE select (the hub/sort switchers): `actionId` is legal and ident-gated, absence stays legal (U0).
  expect(
    pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "source", label: "Hub", options: [{ value: "a", label: "A" }], actionId: "search" }).success,
  ).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "source", label: "Hub", options: [{ value: "a", label: "A" }] }).success).toBe(true);
  expect(
    pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "source", label: "Hub", options: [{ value: "a", label: "A" }], actionId: "NOT AN IDENT" })
      .success,
  ).toBe(false);
});

test("ARM C: an image names exactly one of `assetId` / `assetFrom` — and the belt reaches nested subtrees", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "image", assetFrom: { $state: "detail.cover" } }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "image" }).success).toBe(false);
  // Nested through a masterDetail stage body — the belt walks `pluginChildNodes`, so a violation cannot hide
  // under a non-`children` field (the U5 blind-subtree hazard, re-pinned for the new belt).
  const nested = {
    kind: "masterDetail",
    stages: [{ id: "detail", kind: "detail", body: { kind: "image" } }],
  };
  expect(pluginSurfaceSpecSchema.safeParse(nested).success).toBe(false);
});

test("#798: a detail-stage HERO names exactly one of `assetId` / `assetFrom`, and NEITHER arm can spell a URL", () => {
  const declared = (hero: unknown): unknown => ({ kind: "masterDetail", stages: [{ id: "d", kind: "detail", hero, body: { kind: "text", value: "x" } }] });
  // The bound arm (#798 — a fetched cover whose id lives in published state) is accepted, as is a declared id.
  expect(pluginSurfaceSpecSchema.safeParse(declared({ assetFrom: { $state: "detail.cover" } })).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(declared({ assetId: "asset_01h455vb4pex5vsknk084sn02q" })).success).toBe(true);
  // BOTH arms is two descriptions of one hero; NEITHER is a hero with nothing to show — both refused by the belt.
  expect(pluginSurfaceSpecSchema.safeParse(declared({ assetId: "asset_01h455vb4pex5vsknk084sn02q", assetFrom: { $state: "c" } })).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse(declared({ alt: "no id" })).success).toBe(false);
  // THE ANTI-EXFIL-PIXEL WALL (#798 invariant): a URL is NOT spellable in a node. The declared `assetId` is a
  // TypeID, so a raw URL there fails the schema outright — a guest can never render an <img src=attacker-url>.
  expect(pluginSurfaceSpecSchema.safeParse(declared({ assetId: "https://evil.example/x.png?exfil=secret" })).success).toBe(false);
  // The bound arm carries only a $state PATH (never a URL); the resolved value is format-gated by
  // `resolvePluginBoundAssetId` (proven below) — so a URL smuggled through state paints nothing either.
});

test("#820: the BUNDLE arm is a NAME, and the exactly-one-of belt now counts THREE arms", () => {
  const image = (node: Record<string, unknown>): unknown => ({ kind: "image", ...node });
  // The third arm alone is accepted, on an `image` and on a stage hero.
  expect(pluginSurfaceSpecSchema.safeParse(image({ bundleAsset: "ui/assets/happy.png" })).success).toBe(true);
  expect(
    pluginSurfaceSpecSchema.safeParse({
      kind: "masterDetail",
      stages: [{ id: "d", kind: "detail", hero: { bundleAsset: "ui/assets/hero.webp" }, body: { kind: "text", value: "x" } }],
    }).success,
  ).toBe(true);

  // EXACTLY one: an XOR pair would have silently readmitted "all three", which is a node describing one
  // picture three ways and a renderer picking whichever arm it happens to check first.
  expect(pluginSurfaceSpecSchema.safeParse(image({ assetId: "asset_01h455vb4pex5vsknk084sn02q", bundleAsset: "ui/assets/a.png" })).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse(image({ assetFrom: { $state: "c" }, bundleAsset: "ui/assets/a.png" })).success).toBe(false);
  expect(
    pluginSurfaceSpecSchema.safeParse(image({ assetId: "asset_01h455vb4pex5vsknk084sn02q", assetFrom: { $state: "c" }, bundleAsset: "ui/assets/a.png" }))
      .success,
  ).toBe(false);

  // THE PATH IS FORMAT-WALLED with the funnel's OWN pattern, so a name the install funnel could never have
  // admitted is not spellable in a spec either — traversal, a second segment, an absolute path, a URL.
  for (const bad of [
    "ui/assets/../../etc/passwd",
    "ui/assets/../main.js",
    "ui/assets/sub/a.png",
    "/ui/assets/a.png",
    "ui/assets/.hidden.png",
    "main.js",
    "https://evil.example/x.png",
    "",
  ]) {
    expect(pluginSurfaceSpecSchema.safeParse(image({ bundleAsset: bad })).success, bad).toBe(false);
  }
});

test("#820: a declared grid tile names AT MOST one cover arm — and zero stays legal (the genre's placeholder)", () => {
  const grid = (tile: Record<string, unknown>): unknown => ({ kind: "grid", tiles: [{ id: "t1", title: "One", ...tile }] });
  expect(pluginSurfaceSpecSchema.safeParse(grid({ bundleAsset: "ui/assets/cover.png" })).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(grid({ assetId: "asset_01h455vb4pex5vsknk084sn02q" })).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(grid({})).success).toBe(true); // a coverless tile is a placeholder, not an error
  expect(pluginSurfaceSpecSchema.safeParse(grid({ assetId: "asset_01h455vb4pex5vsknk084sn02q", bundleAsset: "ui/assets/cover.png" })).success).toBe(false);
  // A BOUND tile has no bundle arm at all — a bundle path is spec structure, never published state.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid", tilesFrom: { $state: "results" }, tileAction: "open" }).success).toBe(true);
  expect(resolvePluginBoundTiles({ results: [{ id: "r1", title: "t", bundleAsset: "ui/assets/a.png" }] }, { $state: "results" })[0]).not.toHaveProperty(
    "bundleAsset",
  );
});

test("ARM C: resolvePluginBoundTiles validates, drops, and clamps — state is never a loophole past a registration bound", () => {
  const good = { id: "r1", title: "The Storm", subtitle: "by nobody", badge: "new" };
  const state = {
    results: [
      good,
      { id: "NOT AN IDENT", title: "dropped" }, // malformed id ⇒ dropped, not fatal
      { id: "r2", title: 42 }, // mistyped title ⇒ dropped
      { id: "r3", title: "ok", assetId: "https://evil.example/x.png" }, // a URL is not an asset id ⇒ dropped
      { id: "r4", title: "ok" },
    ],
  };
  const tiles = resolvePluginBoundTiles(state, { $state: "results" });
  expect(tiles.map((tile) => tile.id)).toEqual(["r1", "r4"]);
  // A missing path / non-array resolves to NO tiles — the grid renders its empty line, never a crash.
  expect(resolvePluginBoundTiles(state, { $state: "nope" })).toEqual([]);
  expect(resolvePluginBoundTiles({ results: "not an array" }, { $state: "results" })).toEqual([]);
  // The count clamps to the SAME cap the declared arm's schema enforces.
  const flood = { results: Array.from({ length: PLUGIN_GRID_TILES_MAX + 20 }, (_u, i) => ({ id: `r${i}`, title: "t" })) };
  expect(resolvePluginBoundTiles(flood, { $state: "results" })).toHaveLength(PLUGIN_GRID_TILES_MAX);
});

test("ARM C: resolvePluginBoundAssetId is the FORMAT wall — only a well-formed asset id ever reaches the owner resolve", () => {
  // A real TypeID format passes (ownership is the server resolve's job, judged later and owner-scoped).
  expect(resolvePluginBoundAssetId({ cover: "asset_01h455vb4pex5vsknk084sn02q" }, { $state: "cover" })).toBe("asset_01h455vb4pex5vsknk084sn02q");
  // Everything else paints nothing: a URL, a foreign-prefix id, a number, a missing path.
  expect(resolvePluginBoundAssetId({ cover: "https://evil.example/x.png" }, { $state: "cover" })).toBeUndefined();
  expect(resolvePluginBoundAssetId({ cover: "chat_01h455vb4pex5vsknk084sn02q" }, { $state: "cover" })).toBeUndefined();
  expect(resolvePluginBoundAssetId({ cover: 7 }, { $state: "cover" })).toBeUndefined();
  expect(resolvePluginBoundAssetId({}, { $state: "cover" })).toBeUndefined();
});

// ── hub v1.3 — the bound-vocabulary arms (`select.optionsFrom`, `keyValue.rowsFrom`, live `toggle`) ──────────

test("hub v1.3: a select names exactly one of `options` / `optionsFrom` — both and neither are refused", () => {
  const declared = { kind: "select", name: "sort", label: "Sort", options: [{ value: "a", label: "A" }] };
  const bound = { kind: "select", name: "sort", label: "Sort", optionsFrom: { $state: "sortOptions" } };
  expect(pluginSurfaceSpecSchema.safeParse(declared).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(bound).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...declared, optionsFrom: { $state: "sortOptions" } }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "sort", label: "Sort" }).success).toBe(false);
});

test("hub v1.3: a keyValue names exactly one of `rows` / `rowsFrom` — both and neither are refused, and the belt reaches nested subtrees", () => {
  const declared = { kind: "keyValue", rows: [{ key: "Creator", value: "nobody" }] };
  const bound = { kind: "keyValue", rowsFrom: { $state: "detail.stats" } };
  expect(pluginSurfaceSpecSchema.safeParse(declared).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(bound).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...declared, rowsFrom: { $state: "detail.stats" } }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "keyValue" }).success).toBe(false);
  // Nested reach: the belt walks the shared child seam, so a violating node inside a stack is still caught.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "stack", children: [{ kind: "keyValue" }] }).success).toBe(false);
});

test("hub v1.3: a live toggle's `actionId` rides the ident grammar — arbitrary text is refused", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "toggle", name: "sfw", label: "SFW only", actionId: "search" }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "toggle", name: "sfw", label: "SFW only", actionId: "NOT AN IDENT" }).success).toBe(false);
});

test("hub v1.3: resolvePluginBoundSelectOptions validates, drops, and clamps — the tile-resolve posture", () => {
  const state = {
    sortOptions: [
      { value: "relevance", label: "Hub default" },
      { value: 7, label: "mistyped" }, // dropped
      { bogus: true }, // dropped
      { value: "views", label: "Most viewed" },
    ],
  };
  expect(resolvePluginBoundSelectOptions(state, { $state: "sortOptions" }).map((o) => o.value)).toEqual(["relevance", "views"]);
  expect(resolvePluginBoundSelectOptions(state, { $state: "nope" })).toEqual([]);
  expect(resolvePluginBoundSelectOptions({ sortOptions: "not an array" }, { $state: "sortOptions" })).toEqual([]);
  const flood = { sortOptions: Array.from({ length: PLUGIN_ROWS_MAX + 5 }, (_u, i) => ({ value: `v${i}`, label: "L" })) };
  expect(resolvePluginBoundSelectOptions(flood, { $state: "sortOptions" })).toHaveLength(PLUGIN_ROWS_MAX);
});

test("hub v1.3: resolvePluginBoundKeyValueRows validates, drops, and clamps — plain strings on both fields", () => {
  const state = {
    detail: {
      stats: [
        { key: "Downloads", value: "7.4k" },
        { key: 5 }, // dropped
        { key: "Bound?", value: { $state: "nope" } }, // a binding inside state is NOT a string ⇒ dropped
        { key: "Favorites", value: "212" },
      ],
    },
  };
  expect(resolvePluginBoundKeyValueRows(state, { $state: "detail.stats" }).map((r) => r.key)).toEqual(["Downloads", "Favorites"]);
  expect(resolvePluginBoundKeyValueRows(state, { $state: "detail.nope" })).toEqual([]);
  const flood = { rows: Array.from({ length: PLUGIN_ROWS_MAX + 5 }, (_u, i) => ({ key: `k${i}`, value: "v" })) };
  expect(resolvePluginBoundKeyValueRows(flood, { $state: "rows" })).toHaveLength(PLUGIN_ROWS_MAX);
});
