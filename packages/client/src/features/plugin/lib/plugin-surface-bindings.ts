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
export function readStatePath(state: Record<string, unknown>, path: string): unknown {
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
