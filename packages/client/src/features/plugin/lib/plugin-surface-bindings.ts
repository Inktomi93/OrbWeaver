// plugin-surface-bindings — the PURE spec-binding vocabulary behind the plugin-surface
// renderer. Split from plugin-surface-renderer.tsx so the renderer holds only the JSX mapping: the
// $state-path reader, the bindable string/number resolvers, the form-default collector, the image-id sweep, and
// the display-vs-form node partition. Zero React, zero I/O — every function is a pure function of its inputs
// (an untrusted, already-schema-validated spec + the published state), which is exactly what the renderer walks.

// EVERY WALK BELOW RECURSES THROUGH `pluginChildNodes`, the contracts-side seam, and never through a local
// "which kinds have children" guess. That is not tidiness: `masterDetail` (stage bodies) and `searchBar`
// (filters) carry children under fields that are not called `children`, so a walk with its own idea of the
// container set goes SILENTLY blind to a whole subtree — a cover inside a detail stage never resolving its
// owner-scoped url, a filter field never getting its default. One seam, and the same seam the spec's own DoS
// caps count through.

import type {
  PluginBoundBoolean,
  PluginBoundNumber,
  PluginBoundString,
  PluginGridTile,
  PluginKeyValueRow,
  PluginPageHero,
  PluginSelectOption,
  PluginSurfaceNode,
} from "@orb/contracts/plugin";
import {
  PLUGIN_UI_ASSETS_DIR,
  pluginChildNodes,
  resolvePluginBoundAssetId,
  resolvePluginBoundBoolean,
  resolvePluginBoundKeyValueRows,
  resolvePluginBoundSelectOptions,
  resolvePluginBoundTabOptions,
  resolvePluginBoundTiles,
} from "@orb/contracts/plugin";
import type { AssetId } from "@orb/kit/ids";

/** A `meter` with no explicit `max` scales to 100 (the house percentage default). */
export const METER_DEFAULT_MAX = 100;

/** Read a dotted path out of the published state (`{ $state: "a.b" }`); `undefined` for any miss or non-object hop. */
function readStatePath(state: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = state;
  for (const segment of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null) {
      return;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Resolve a bindable STRING: a `{ $state }` binding against the published state, else the literal. A miss
 *  renders the empty string (never a raw object). */
export function resolveString(value: PluginBoundString, state: Record<string, unknown>): string {
  if (typeof value === "string") {
    return value;
  }
  const resolved = readStatePath(state, value.$state);
  if (typeof resolved === "string") {
    return resolved;
  }
  return typeof resolved === "number" ? String(resolved) : "";
}

/** Resolve a bindable NUMBER: a `{ $state }` binding, else the literal. A miss/non-number resolves to 0. */
export function resolveNumber(value: PluginBoundNumber, state: Record<string, unknown>): number {
  if (typeof value === "number") {
    return value;
  }
  const resolved = readStatePath(state, value.$state);
  return typeof resolved === "number" ? resolved : 0;
}

/** A numeric form value with a fallback for the empty/unset state. */
export function numFromValues(values: Record<string, string>, name: string, fallback: number): number {
  const raw = values[name];
  return raw === undefined || raw === "" ? fallback : Number(raw);
}

/** Does this spec bind ANY value to published state (`{ $state }`)? The SILENCE test for a room-anchored
 *  surface: a bound spec whose plugin has published nothing yet would render
 *  its fallbacks — an empty meter, blank rows — as room chrome, which is exactly the "broken frame" §4.9
 *  refuses. A surface that binds nothing is PURELY STATIC and always has something to say, so it renders on
 *  sight. Pure + recursive through the shared `pluginChildNodes` seam. */
export function specBindsState(node: PluginSurfaceNode): boolean {
  if (ownBinding(node)) {
    return true;
  }
  return pluginChildNodes(node).some((child) => specBindsState(child));
}

/** Does THIS node (ignoring its children) bind a value to published state? */
function ownBinding(node: PluginSurfaceNode): boolean {
  if (node.kind === "text" || node.kind === "markdown" || node.kind === "meter") {
    return isBinding(node.value);
  }
  if (node.kind === "badge") {
    return isBinding(node.text);
  }
  if (node.kind === "keyValue") {
    // The bound arm (`rowsFrom`, hub v1.3) is a binding by construction — a detail page whose only
    // binding is a state-driven stat sheet must not read as "purely static" (the §4.9 silence rule).
    return node.rowsFrom !== undefined || (node.rows ?? []).some((row) => isBinding(row.value));
  }
  if (node.kind === "list") {
    return node.items.some((item) => isBinding(item));
  }
  // The U5/#799 browse + option kinds — and the "binds nothing" tail — live in {@link browseOwnBinding}.
  return browseOwnBinding(node);
}

/** The BROWSE + OPTION kinds' own-binding arms — the TAIL of {@link ownBinding}, split out so that function
 *  stays under the house cognitive-complexity ceiling. It owns the final `false` too, so the pair is a
 *  straight continuation rather than a tri-state handshake. */
function browseOwnBinding(node: PluginSurfaceNode): boolean {
  // They must be listed or a page whose entire content is a state-bound grid would read as "purely static"
  // and render its empty fallbacks as room chrome (the §4.9 silence rule). A BOUND grid (`tilesFrom`, #774
  // ARM C), a bound `loading` (#799) and a bound image (`assetFrom`) are bindings by construction.
  if (node.kind === "grid") {
    return (
      node.tilesFrom !== undefined ||
      // A bound `loading` (#799) is a binding by construction — a browse page whose grid is skeletoned by
      // state must not read as "purely static" (the §4.9 silence rule).
      (node.loading !== undefined && isBinding(node.loading)) ||
      (node.tiles ?? []).some(
        (tile) => isBinding(tile.title) || (tile.subtitle !== undefined && isBinding(tile.subtitle)) || (tile.badge !== undefined && isBinding(tile.badge)),
      )
    );
  }
  if (node.kind === "image") {
    return node.assetFrom !== undefined;
  }
  if (node.kind === "masterDetail") {
    return (
      (node.active !== undefined && isBinding(node.active)) ||
      // A bound hero (`assetFrom`, #798) is a binding by construction — so is a bound stage title. Without the
      // hero arm a page whose only binding is a state-driven cover would read as "purely static" and paint its
      // no-cover fallback as room chrome (the §4.9 silence rule).
      node.stages.some((stage) => (stage.title !== undefined && isBinding(stage.title)) || stage.hero?.assetFrom !== undefined)
    );
  }
  // A bound select (`optionsFrom`, hub v1.3) binds its VOCABULARY to state even though its picked value
  // stays client-transient — without this arm a page whose only binding is a per-hub sort menu would
  // read as "purely static" and render an empty select as room chrome (the §4.9 silence rule).
  // The `tabs` strip (#799) speaks the same grammar, so it binds for the same reason.
  if (node.kind === "select" || node.kind === "tabs") {
    return node.optionsFrom !== undefined;
  }
  // The remaining form/action kinds carry no bindable value (their values are client-transient until an
  // action submits them), so a form-only surface is static by construction.
  return false;
}

/** A bindable slot holds either a primitive literal or the `{ $state }` object — so "is it bound" is "is it
 *  the object arm". */
function isBinding(value: PluginBoundString | PluginBoundNumber | PluginBoundBoolean): boolean {
  return typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean";
}

/** Collect every asset id the spec paints — `image` nodes, `grid` tile covers and `masterDetail` stage heroes
 *  (resolved once, owner-scoped, at the top of the render; an id the installer does not own simply yields no
 *  ref and the node renders its placeholder). Every SITE that can name an asset is listed here, and the
 *  recursion is the shared seam, so a cover buried in a detail stage resolves like any other.
 *
 *  IT TAKES THE STATE (#774 ARM C) because two of the sites are BOUND — a grid's `tilesFrom` covers and an
 *  image's `assetFrom` live in published state, not in the spec — and a sweep that only read the spec would
 *  go silently blind to them (the collected id set feeds the ONE owner-scoped `resolveBlobRefs` read, so a
 *  bound cover that never entered it would never paint). The resolvers are the contracts-side trust gates:
 *  every state-sourced id is FORMAT-validated before it joins the set, and the server's owner-scoped resolve
 *  then judges ownership for spec-declared and state-bound ids identically — a foreign id yields no ref and
 *  the node paints its placeholder, never another owner's blob. */
export function collectImageAssetIds(
  node: PluginSurfaceNode,
  state: Record<string, unknown>,
  bundleAssets: ReadonlyMap<string, AssetId>,
  out: AssetId[],
): void {
  if (node.kind === "image") {
    pushDefined(out, coverAssetId(imageNodeCoverKey(node, state), bundleAssets));
  }
  if (node.kind === "grid") {
    for (const tile of gridTiles(node, state)) {
      pushDefined(out, coverAssetId(tileCoverKey(tile), bundleAssets));
    }
  }
  if (node.kind === "masterDetail") {
    for (const stage of node.stages) {
      // ALL hero arms collapse through `heroCoverKey` (#798/#820): the declared id, the `assetFrom` binding
      // resolved (format-gated) against state, or the bundle path — so every one joins the ONE owner-scoped
      // resolve and none paints on its own.
      pushDefined(out, stage.hero === undefined ? undefined : coverAssetId(heroCoverKey(stage.hero, state), bundleAssets));
    }
  }
  for (const child of pluginChildNodes(node)) {
    collectImageAssetIds(child, state, bundleAssets, out);
  }
}

/** Turn a COVER KEY into the asset id to resolve. The two key spaces are told apart by the bundle PREFIX, not
 *  by a map hit: a `ui/assets/…` key (#820) resolves through THIS plugin's install-time map and yields NOTHING
 *  when the plugin never shipped that path, while anything else is already an `asset_…` id.
 *
 *  The prefix test is load-bearing rather than stylistic. A `?? key` fallback would push the raw PATH into the
 *  id set on the render before the map lands (and forever, for a path that was dropped by an upgrade) — and
 *  `assets.resolveBlobRefs` validates its whole input array against the TypeID schema, so one non-id entry
 *  fails the request and EVERY image on the surface goes blank. An unmapped path must be a per-node
 *  placeholder, never a surface-wide blank. */
function coverAssetId(key: string | undefined, bundleAssets: ReadonlyMap<string, AssetId>): AssetId | undefined {
  if (key === undefined) {
    return;
  }
  return key.startsWith(PLUGIN_UI_ASSETS_DIR) ? bundleAssets.get(key) : (key as AssetId);
}

/** Does this spec name ANY `bundleAsset` path (#820)? The gate on the extra per-plugin `listBundleAssets`
 *  read: a surface that ships no bundle art must not pay for a query, and — because the map is only ever a
 *  NAME lookup — a spec that names none has nothing the map could change. Pure + recursive through the same
 *  `pluginChildNodes` seam every other walk here uses. */
export function specNamesBundleAsset(node: PluginSurfaceNode): boolean {
  if (node.kind === "image" && node.bundleAsset !== undefined) {
    return true;
  }
  if (node.kind === "grid" && (node.tiles ?? []).some((tile) => tile.bundleAsset !== undefined)) {
    return true;
  }
  if (node.kind === "masterDetail" && node.stages.some((stage) => stage.hero?.bundleAsset !== undefined)) {
    return true;
  }
  return pluginChildNodes(node).some((child) => specNamesBundleAsset(child));
}

/** A stage hero's effective COVER KEY — the declared id, the bound arm (`assetFrom`, #798) resolved
 *  (format-gated) against state, or the bundle path (#820). The exactly-one-of belt means at most one arm is
 *  present. The `image` node's `imageNodeCoverKey` one plane over, so both surfaces resolve identically. */
export function heroCoverKey(hero: PluginPageHero, state: Record<string, unknown>): string | undefined {
  if (hero.assetId !== undefined) {
    return hero.assetId;
  }
  if (hero.bundleAsset !== undefined) {
    return hero.bundleAsset;
  }
  return hero.assetFrom === undefined ? undefined : resolvePluginBoundAssetId(state, hero.assetFrom);
}

/** A grid tile's effective COVER KEY — the declared id or the bundle path (#820). A tile has no bound arm
 *  (a BOUND tile's cover is already an id in published state), so this is a two-way choice; both absent is
 *  the genre's shape-matched placeholder. */
export function tileCoverKey(tile: PluginGridTile): string | undefined {
  return tile.assetId ?? tile.bundleAsset;
}

function pushDefined(out: AssetId[], id: AssetId | undefined): void {
  if (id !== undefined) {
    out.push(id);
  }
}

/** An `image` node's effective COVER KEY — the declared id, the bound arm resolved (format-gated) against
 *  state, or the bundle path (#820). The exactly-one-of belt means exactly one arm is present. */
export function imageNodeCoverKey(node: Extract<PluginSurfaceNode, { kind: "image" }>, state: Record<string, unknown>): string | undefined {
  if (node.assetId !== undefined) {
    return node.assetId;
  }
  if (node.bundleAsset !== undefined) {
    return node.bundleAsset;
  }
  return node.assetFrom === undefined ? undefined : resolvePluginBoundAssetId(state, node.assetFrom);
}

/** A grid's effective tile list — declared tiles verbatim, or the bound arm resolved (validated + clamped)
 *  against state. The ONE place both arms collapse to the common shape (`PluginGridTile` — a bound tile is a
 *  strict subset: plain strings, no per-tile `actionId`), shared by the sweep above and the renderer, so they
 *  can never disagree about what a grid shows. */
export function gridTiles(node: Extract<PluginSurfaceNode, { kind: "grid" }>, state: Record<string, unknown>): readonly PluginGridTile[] {
  if (node.tiles !== undefined) {
    return node.tiles;
  }
  return node.tilesFrom === undefined ? [] : resolvePluginBoundTiles(state, node.tilesFrom);
}

/** A select's effective option list (hub v1.3) — declared options verbatim, or the bound arm resolved
 *  (validated + clamped) against state. The `gridTiles` collapse one kind over: both arms meet at the
 *  common shape so the renderer never knows which arm fed it. */
export function selectOptions(node: Extract<PluginSurfaceNode, { kind: "select" }>, state: Record<string, unknown>): readonly PluginSelectOption[] {
  if (node.options !== undefined) {
    return node.options;
  }
  return node.optionsFrom === undefined ? [] : resolvePluginBoundSelectOptions(state, node.optionsFrom);
}

/** A `tabs` strip's effective option list (#799) — declared options verbatim, or the bound arm resolved
 *  (validated + clamped to the STRIP's own smaller cap) against state. The `selectOptions` collapse one
 *  kind over: both arms meet at the common shape so the renderer never knows which arm fed it. */
export function tabOptions(node: Extract<PluginSurfaceNode, { kind: "tabs" }>, state: Record<string, unknown>): readonly PluginSelectOption[] {
  if (node.options !== undefined) {
    return node.options;
  }
  return node.optionsFrom === undefined ? [] : resolvePluginBoundTabOptions(state, node.optionsFrom);
}

/** A grid's effective LOADING verdict (#799) — the declared literal or the bound path, resolved through the
 *  contracts-side gate (a miss or a non-boolean is FALSE, so a binding typo can never wedge a permanent
 *  skeleton). Absent ⇒ not loading. */
export function gridLoading(node: Extract<PluginSurfaceNode, { kind: "grid" }>, state: Record<string, unknown>): boolean {
  return node.loading !== undefined && resolvePluginBoundBoolean(state, node.loading);
}

/** A keyValue's effective row list (hub v1.3) — declared rows verbatim (values may still bind), or the
 *  bound arm resolved (validated + clamped) against state. A bound row's plain-string value IS a
 *  `PluginBoundString`, so both arms meet at the declared row shape. */
export function keyValueRows(node: Extract<PluginSurfaceNode, { kind: "keyValue" }>, state: Record<string, unknown>): readonly PluginKeyValueRow[] {
  if (node.rows !== undefined) {
    return node.rows;
  }
  return node.rowsFrom === undefined ? [] : resolvePluginBoundKeyValueRows(state, node.rowsFrom);
}

/** Stringify a primitive form default. Concretely typed so the toString is the primitive's own, never a
 *  default-object one (the nursery `noBaseToString` guard). */
function primToString(value: number | boolean): string {
  return value.toString();
}

/** Collect form-field defaults — the initial `values` bag (every field serializes to a string). Containers
 *  recurse; display + action kinds hold no submittable draft. An if-chain, not a switch, so the display kinds
 *  carry no exhaustive-case obligation over the full node union. */
export function collectDefaults(node: PluginSurfaceNode, out: Record<string, string>): void {
  // `searchBar` seeds the query field it owns AND recurses into its filter tail — a filter field whose default
  // never landed would submit empty on the first search, which reads as "the filter did nothing".
  if (node.kind === "textField" || node.kind === "select" || node.kind === "searchBar" || node.kind === "tabs") {
    out[node.name] = node.value ?? "";
  } else if (node.kind === "numberField" || node.kind === "slider") {
    out[node.name] = node.value === undefined ? "" : primToString(node.value);
  } else if (node.kind === "toggle") {
    out[node.name] = primToString(node.value ?? false);
  }
  for (const child of pluginChildNodes(node)) {
    collectDefaults(child, out);
  }
}
