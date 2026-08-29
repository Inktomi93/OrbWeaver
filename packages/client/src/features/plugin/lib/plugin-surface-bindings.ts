// plugin-surface-bindings — the PURE spec-binding vocabulary behind the plugin-surface renderer (plugin-ui-plane
// #679 U1, §4.3). Split from plugin-surface-renderer.tsx so the renderer holds only the JSX mapping: the
// $state-path reader, the bindable string/number resolvers, the form-default collector, the image-id sweep, and
// the display-vs-form node partition. Zero React, zero I/O — every function is a pure function of its inputs
// (an untrusted, already-schema-validated spec + the published state), which is exactly what the renderer walks.

// EVERY WALK BELOW RECURSES THROUGH `pluginChildNodes`, the contracts-side seam, and never through a local
// "which kinds have children" guess. That is not tidiness: `masterDetail` (stage bodies) and `searchBar`
// (filters) carry children under fields that are not called `children`, so a walk with its own idea of the
// container set goes SILENTLY blind to a whole subtree — a cover inside a detail stage never resolving its
// owner-scoped url, a filter field never getting its default. One seam, and the same seam the spec's own DoS
// caps count through.

import type { PluginBoundNumber, PluginBoundString, PluginGridTile, PluginPageHero, PluginSurfaceNode } from "@orb/contracts/plugin";
import { pluginChildNodes, resolvePluginBoundAssetId, resolvePluginBoundTiles } from "@orb/contracts/plugin";
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
 *  surface (plugin-ui-plane #679 U2, §4.9): a bound spec whose plugin has published nothing yet would render
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
    return node.rows.some((row) => isBinding(row.value));
  }
  if (node.kind === "list") {
    return node.items.some((item) => isBinding(item));
  }
  // The U5 browse kinds bind too, and they must be listed or a page whose entire content is a state-bound grid
  // would read as "purely static" and render its empty fallbacks as room chrome (the §4.9 silence rule). A
  // BOUND grid (`tilesFrom`, #774 ARM C) and a bound image (`assetFrom`) are bindings by construction.
  if (node.kind === "grid") {
    return (
      node.tilesFrom !== undefined ||
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
  // The form/action kinds carry no bindable value (their values are client-transient until an action submits
  // them), so a form-only surface is static by construction.
  return false;
}

/** A bindable slot holds either a primitive literal or the `{ $state }` object — so "is it bound" is "is it
 *  the object arm". */
function isBinding(value: PluginBoundString | PluginBoundNumber): boolean {
  return typeof value !== "string" && typeof value !== "number";
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
export function collectImageAssetIds(node: PluginSurfaceNode, state: Record<string, unknown>, out: AssetId[]): void {
  if (node.kind === "image") {
    pushDefined(out, imageNodeAssetId(node, state));
  }
  if (node.kind === "grid") {
    for (const tile of gridTiles(node, state)) {
      pushDefined(out, tile.assetId);
    }
  }
  if (node.kind === "masterDetail") {
    for (const stage of node.stages) {
      // BOTH hero arms collapse through `heroAssetId` (#798): the declared id, or the `assetFrom` binding
      // resolved (format-gated) against state — so a bound cover joins the ONE owner-scoped resolve, never
      // painting on its own.
      pushDefined(out, stage.hero === undefined ? undefined : heroAssetId(stage.hero, state));
    }
  }
  for (const child of pluginChildNodes(node)) {
    collectImageAssetIds(child, state, out);
  }
}

/** A stage hero's effective asset id — the declared arm, or the bound arm (`assetFrom`, #798) resolved
 *  (format-gated) against state. The exactly-one-of belt means at most one arm is present. The `image` node's
 *  `imageNodeAssetId` one plane over, so both surfaces resolve a bound cover identically. */
export function heroAssetId(hero: PluginPageHero, state: Record<string, unknown>): AssetId | undefined {
  if (hero.assetId !== undefined) {
    return hero.assetId;
  }
  return hero.assetFrom === undefined ? undefined : resolvePluginBoundAssetId(state, hero.assetFrom);
}

function pushDefined(out: AssetId[], id: AssetId | undefined): void {
  if (id !== undefined) {
    out.push(id);
  }
}

/** An `image` node's effective asset id — the declared arm, or the bound arm resolved (format-gated) against
 *  state. The exactly-one-of belt means at most one arm is present. */
export function imageNodeAssetId(node: Extract<PluginSurfaceNode, { kind: "image" }>, state: Record<string, unknown>): AssetId | undefined {
  if (node.assetId !== undefined) {
    return node.assetId;
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
  if (node.kind === "textField" || node.kind === "select" || node.kind === "searchBar") {
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
