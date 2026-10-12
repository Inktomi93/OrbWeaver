// Contract tests for @orb/contracts/plugin/ui — the icon, tabs and grid-loading vocabulary additions.

import {
  PLUGIN_FOOTER_NODE_KIND_ALLOWED,
  PLUGIN_ICON_NAMES,
  PLUGIN_ROWS_MAX,
  PLUGIN_TABS_OPTIONS_MAX,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
  resolvePluginBoundSelectOptions,
  resolvePluginBoundTabOptions,
} from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// ── #799 — the VOCABULARY-REACH additions (icon / tabs / grid.loading) ────────────────────────────────────────

test("#799: the icon tuple EXCLUDES every chrome-identity, consent/trust and identity glyph — the curation IS the wall", () => {
  // The exclusion is the whole security argument for admitting a glyph vocabulary at all: a plugin that could
  // draw the attribution mark, a lock or a shield could dress a fake consent row in the house's own trust
  // iconography. Pinned BY VALUE, so quietly adding one of these names to the tuple reds here.
  const forbidden = [
    "blocks",
    "orbWeb",
    "lock",
    "lockOpen",
    "unlock",
    "keyRound",
    "shield",
    "shieldHalf",
    "ban",
    "circleUser",
    "userPlus",
    "userX",
    "settings",
    "menu",
  ];
  for (const name of forbidden) {
    expect(PLUGIN_ICON_NAMES).not.toContain(name);
  }
  // Positive control: the tuple is not merely empty — the counters the node was minted for ARE reachable.
  expect(PLUGIN_ICON_NAMES).toContain("download");
  expect(PLUGIN_ICON_NAMES).toContain("star");
});

test("#799: an `icon` node names a tuple member or is REFUSED — the glyph axis is parse-tier as well as compile-tier", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "icon", name: "download" }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "icon", name: "download", label: "Downloads" }).success).toBe(true);
  // An off-tuple glyph — including two that DO exist in the house seal and were deliberately excluded.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "icon", name: "lock" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "icon", name: "blocks" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "icon" }).success).toBe(false);
});

test("#799: `icon` is ADMITTED at the message-footer and `tabs` is REFUSED — decoration vs an action round-trip per row", () => {
  expect(PLUGIN_FOOTER_NODE_KIND_ALLOWED.icon).toBe(true);
  expect(PLUGIN_FOOTER_NODE_KIND_ALLOWED.tabs).toBe(false);
  const footer = { anchor: "message-footer", id: "s", title: "T", tier: "static" } as const;
  expect(pluginSurfaceRegistrationMetaSchema.safeParse({ ...footer, spec: { kind: "row", children: [{ kind: "icon", name: "star" }] } }).success).toBe(true);
  expect(
    pluginSurfaceRegistrationMetaSchema.safeParse({
      ...footer,
      spec: { kind: "row", children: [{ kind: "tabs", name: "hub", label: "Hub", options: [{ value: "a", label: "A" }] }] },
    }).success,
  ).toBe(false);
});

test("#799: a `tabs` node carries the select's exactly-one-of belt — both arms or neither is a REFUSAL", () => {
  const base = { kind: "tabs", name: "hub", label: "Hub" };
  expect(pluginSurfaceSpecSchema.safeParse({ ...base, options: [{ value: "a", label: "A" }] }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...base, optionsFrom: { $state: "hubs" } }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...base, options: [{ value: "a", label: "A" }], optionsFrom: { $state: "hubs" } }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse(base).success).toBe(false);
  // The values-bag key is an ident, never arbitrary text (the form-field grammar).
  expect(pluginSurfaceSpecSchema.safeParse({ ...base, name: "NOT AN IDENT", options: [{ value: "a", label: "A" }] }).success).toBe(false);
});

test("#799: the tabs option cap is the STRIP's, an order of magnitude under the select's — a bigger vocabulary is a select", () => {
  expect(PLUGIN_TABS_OPTIONS_MAX).toBeLessThan(PLUGIN_ROWS_MAX);
  const options = (n: number): readonly { value: string; label: string }[] => Array.from({ length: n }, (_u, i) => ({ value: `v${i}`, label: "L" }));
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "tabs", name: "hub", label: "Hub", options: options(PLUGIN_TABS_OPTIONS_MAX) }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "tabs", name: "hub", label: "Hub", options: options(PLUGIN_TABS_OPTIONS_MAX + 1) }).success).toBe(false);
  // A select of the SAME size is still fine — the strip's cap is a LAYOUT bound, not a new global one.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "hub", label: "Hub", options: options(PLUGIN_TABS_OPTIONS_MAX + 1) }).success).toBe(true);
});

test("#799: resolvePluginBoundTabOptions clamps to the STRIP's cap — state is never a loophole past a layout bound", () => {
  const flood = { hubs: Array.from({ length: PLUGIN_TABS_OPTIONS_MAX + 6 }, (_u, i) => ({ value: `v${i}`, label: "L" })) };
  expect(resolvePluginBoundTabOptions(flood, { $state: "hubs" })).toHaveLength(PLUGIN_TABS_OPTIONS_MAX);
  // The SELECT resolver over the same state is not clamped to 8 — the two caps are really distinct, and this
  // is the control that would catch a copy-paste that reused `PLUGIN_ROWS_MAX` here.
  expect(resolvePluginBoundSelectOptions(flood, { $state: "hubs" })).toHaveLength(PLUGIN_TABS_OPTIONS_MAX + 6);
  expect(resolvePluginBoundTabOptions({ hubs: [{ value: "a", label: "A" }, { bogus: true }] }, { $state: "hubs" }).map((o) => o.value)).toEqual(["a"]);
  expect(resolvePluginBoundTabOptions({}, { $state: "hubs" })).toEqual([]);
});

test("#799: a grid's `loading` accepts a literal or a binding, and nothing else", () => {
  const grid = { kind: "grid", tilesFrom: { $state: "tiles" }, tileAction: "open" };
  expect(pluginSurfaceSpecSchema.safeParse({ ...grid, loading: true }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...grid, loading: { $state: "busy" } }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...grid, loading: "yes" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ ...grid, loading: 1 }).success).toBe(false);
});
