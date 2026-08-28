// plugin-surface-bindings — the PURE spec-binding vocabulary behind the plugin-surface renderer (plugin-ui-plane
// #679 U1, §4.3). Split from plugin-surface-renderer.tsx so the renderer holds only the JSX mapping: the
// $state-path reader, the bindable string/number resolvers, the form-default collector, the image-id sweep, and
// the display-vs-form node partition. Zero React, zero I/O — every function is a pure function of its inputs
// (an untrusted, already-schema-validated spec + the published state), which is exactly what the renderer walks.

import type { PluginBoundNumber, PluginBoundString, PluginSurfaceNode } from "@orb/contracts/plugin";
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
 *  sight. Pure + recursive over the same three container kinds every walk here uses. */
export function specBindsState(node: PluginSurfaceNode): boolean {
  if (node.kind === "stack" || node.kind === "row" || node.kind === "section") {
    return node.children.some((child) => specBindsState(child));
  }
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
  // The seven form/action kinds carry no bindable value (their values are client-transient until an action
  // submits them), so a form-only surface is static by construction.
  return false;
}

/** A bindable slot holds either a primitive literal or the `{ $state }` object — so "is it bound" is "is it
 *  the object arm". */
function isBinding(value: PluginBoundString | PluginBoundNumber): boolean {
  return typeof value !== "string" && typeof value !== "number";
}

/** Collect every `image` node's assetId (resolved once, owner-scoped, at the top of the render). */
export function collectImageAssetIds(node: PluginSurfaceNode, out: AssetId[]): void {
  if (node.kind === "image") {
    out.push(node.assetId);
    return;
  }
  if (node.kind === "stack" || node.kind === "row" || node.kind === "section") {
    for (const child of node.children) {
      collectImageAssetIds(child, out);
    }
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
  if (node.kind === "stack" || node.kind === "row" || node.kind === "section") {
    for (const child of node.children) {
      collectDefaults(child, out);
    }
    return;
  }
  if (node.kind === "textField" || node.kind === "select") {
    out[node.name] = node.value ?? "";
    return;
  }
  if (node.kind === "numberField" || node.kind === "slider") {
    out[node.name] = node.value === undefined ? "" : primToString(node.value);
    return;
  }
  if (node.kind === "toggle") {
    out[node.name] = primToString(node.value ?? false);
  }
}
