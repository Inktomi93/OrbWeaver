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

import type { PluginBoundNumber, PluginBoundString, PluginSurfaceNode } from "@orb/contracts/plugin";
import { pluginChildNodes } from "@orb/contracts/plugin";
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
  // would read as "purely static" and render its empty fallbacks as room chrome (the §4.9 silence rule).
  if (node.kind === "grid") {
    return node.tiles.some(
      (tile) => isBinding(tile.title) || (tile.subtitle !== undefined && isBinding(tile.subtitle)) || (tile.badge !== undefined && isBinding(tile.badge)),
    );
  }
  if (node.kind === "masterDetail") {
    return (node.active !== undefined && isBinding(node.active)) || node.stages.some((stage) => stage.title !== undefined && isBinding(stage.title));
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
 *  recursion is the shared seam, so a cover buried in a detail stage resolves like any other. */
export function collectImageAssetIds(node: PluginSurfaceNode, out: AssetId[]): void {
  if (node.kind === "image") {
    out.push(node.assetId);
  }
  if (node.kind === "grid") {
    for (const tile of node.tiles) {
      if (tile.assetId !== undefined) {
        out.push(tile.assetId);
      }
    }
  }
  if (node.kind === "masterDetail") {
    for (const stage of node.stages) {
      if (stage.hero !== undefined) {
        out.push(stage.hero.assetId);
      }
    }
  }
  for (const child of pluginChildNodes(node)) {
    collectImageAssetIds(child, out);
  }
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
