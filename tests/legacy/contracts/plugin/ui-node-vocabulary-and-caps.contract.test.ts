// Contract tests for @orb/contracts/plugin/ui — the node vocabulary, form discipline and the spec-root caps.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  PLUGIN_NODE_KINDS,
  PLUGIN_ROWS_MAX,
  PLUGIN_SPEC_MAX_BYTES,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SPEC_MAX_NODES,
  PLUGIN_TEXT_MAX_BYTES,
  pluginSurfaceSpecSchema,
} from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("PLUGIN_NODE_KINDS is the pinned 22-kind vocabulary in §4.3 order (U5 appended the browse genre; #799 the reach pair)", () => {
  expect(PLUGIN_NODE_KINDS).toEqual([
    "stack",
    "row",
    "section",
    "text",
    "badge",
    "meter",
    "keyValue",
    "list",
    "image",
    "markdown",
    "textField",
    "numberField",
    "toggle",
    "select",
    "slider",
    "button",
    "confirmButton",
    "grid",
    "masterDetail",
    "searchBar",
    "icon",
    "tabs",
  ]);
});

test("pluginSurfaceSpecSchema accepts a well-formed nested settings-style tree", () => {
  const spec: PluginSurfaceSpec = {
    kind: "stack",
    gap: "block",
    children: [
      { kind: "section", kicker: "Settings", children: [{ kind: "text", value: "A panel drawn by the app.", voice: "gloss" }] },
      { kind: "textField", name: "api_key", label: "API key", placeholder: "sk-…" },
      { kind: "toggle", name: "enabled", label: "Enabled", value: true },
      { kind: "select", name: "mode", label: "Mode", options: [{ value: "fast", label: "Fast" }], value: "fast" },
      { kind: "badge", text: "Ready", intent: "success" },
      { kind: "button", actionId: "save", label: "Save", variant: "outline" },
    ],
  };
  expect(pluginSurfaceSpecSchema.safeParse(spec).success).toBe(true);
});

test("a value MAY be a `{ $state }` binding — resolved by the renderer against published state", () => {
  const bound: PluginSurfaceSpec = { kind: "text", value: { $state: "weather.summary" } };
  expect(pluginSurfaceSpecSchema.safeParse(bound).success).toBe(true);
  // …but a deferred `$chatVar` binding is NOT vocabulary yet (U0 ships only `$state`).
  const chatVar = { kind: "text", value: { $chatVar: "mood" } };
  expect(pluginSurfaceSpecSchema.safeParse(chatVar).success).toBe(false);
});

test("an unknown node kind is refused (the closed union is the impersonation wall)", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "iframe", src: "https://evil.example" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "html", value: "<script>alert(1)</script>" }).success).toBe(false);
});

test("form-field names and actionIds are bounded idents — never arbitrary text (values-bag key discipline)", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "textField", name: "Field One", label: "L" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "textField", name: "field_one", label: "L" }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "button", actionId: "Do It", label: "L" }).success).toBe(false);
});

test("a form input requires a label (the a11y floor is unskippable)", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "toggle", name: "x", label: "" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "toggle", name: "x" }).success).toBe(false);
});

test("a text value over the 2 KiB per-node string cap is refused", () => {
  const tooLong = "x".repeat(3000); // > PLUGIN_TEXT_MAX_BYTES (2 KiB)
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "text", value: tooLong }).success).toBe(false);
});

test("the 2 KiB text cap counts BYTES, not UTF-16 code units (#1367)", () => {
  // `z.string().max()` measures `.length`, so 2048 CJK characters — 6144 bytes — passed a cap documented in
  // bytes. The defect is one-directional (UTF-16 length never exceeds UTF-8 byte length), so nothing that
  // fits the byte budget was ever wrongly refused, and these two arms pin both directions.
  const cjkOverBudget = "中".repeat(PLUGIN_TEXT_MAX_BYTES / 2); // 1024 chars, 3072 bytes
  expect(new TextEncoder().encode(cjkOverBudget).length).toBeGreaterThan(PLUGIN_TEXT_MAX_BYTES);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "text", value: cjkOverBudget }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "markdown", value: cjkOverBudget }).success).toBe(false);
  // Non-ASCII text that genuinely fits the byte budget is still accepted.
  const cjkInBudget = "中".repeat(PLUGIN_TEXT_MAX_BYTES / 6);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "text", value: cjkInBudget }).success).toBe(true);
  // …and the state-binding arm of the same field is untouched by the measurement.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "text", value: { $state: "greeting" } }).success).toBe(true);
});

test("#1525 an unpaired surrogate is a REFUSAL, and safeParse never throws on one", () => {
  // The byte counter used to be `encodeURIComponent(...)`, which THROWS `URIError` on a lone surrogate. That
  // was survivable while the only caller measured `JSON.stringify(spec)` (which escapes them); measuring raw
  // GUEST text made a one-character value crash the validator instead of refusing it — a `safeParse` that
  // throws is not a boundary, and this schema runs on guest input AND inside the client's renderer.
  for (const value of ["\ud800", "ok\udfff", "\ud83dx"]) {
    const parsed = pluginSurfaceSpecSchema.safeParse({ kind: "text", value });
    expect(parsed.success).toBe(false);
  }
  expect(() => pluginSurfaceSpecSchema.safeParse({ kind: "markdown", value: "\ud800" })).not.toThrow();
  // A WELL-FORMED astral value is still accepted and still measured in bytes (4 per emoji code point).
  const emoji = "🎲".repeat(PLUGIN_TEXT_MAX_BYTES / 8);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "text", value: emoji }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "text", value: "🎲".repeat(PLUGIN_TEXT_MAX_BYTES / 2) }).success).toBe(false);
  // The whole-spec cap (which measures `JSON.stringify`) still agrees with the per-node one.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "text", value: "中".repeat(3) }).success).toBe(true);
});

test(`list / keyValue / select refuse more than ${PLUGIN_ROWS_MAX} rows`, () => {
  const items = Array.from({ length: PLUGIN_ROWS_MAX + 1 }, (_, i) => `item ${i}`);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "list", items }).success).toBe(false);
  const rows = Array.from({ length: PLUGIN_ROWS_MAX + 1 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "keyValue", rows }).success).toBe(false);
});

test("the SPEC-root global caps close what a per-node schema cannot: node count, depth, and total bytes", () => {
  // NODE COUNT — a flat stack of MAX+1 leaves (plus the root) is over the total-node ceiling.
  const tooMany: PluginSurfaceSpec = {
    kind: "stack",
    children: Array.from({ length: PLUGIN_SPEC_MAX_NODES }, () => ({ kind: "text", value: "n" }) as const),
  };
  expect(pluginSurfaceSpecSchema.safeParse(tooMany).success).toBe(false);

  // DEPTH — nest containers one deeper than the cap (root = depth 1).
  let deep: PluginSurfaceSpec = { kind: "text", value: "leaf" };
  for (let i = 0; i < PLUGIN_SPEC_MAX_DEPTH; i++) {
    deep = { kind: "stack", children: [deep] };
  }
  expect(pluginSurfaceSpecSchema.safeParse(deep).success).toBe(false);

  // BYTES — a handful of near-max text nodes clears node/depth but blows the serialized-size ceiling.
  const heavy: PluginSurfaceSpec = {
    kind: "stack",
    children: Array.from({ length: 20 }, () => ({ kind: "text", value: "y".repeat(2000) }) as const),
  };
  const stats = pluginSurfaceSpecSchema.safeParse(heavy);
  expect(JSON.stringify(heavy).length).toBeGreaterThan(PLUGIN_SPEC_MAX_BYTES);
  expect(stats.success).toBe(false);

  // …and a modest, well-formed tree of the same shape passes all three.
  const ok: PluginSurfaceSpec = { kind: "stack", children: [{ kind: "text", value: "small" }] };
  expect(pluginSurfaceSpecSchema.safeParse(ok).success).toBe(true);
});

test("a button's `disabled` is kept as a literal or a binding, and nothing else passes", () => {
  const button = { kind: "button", actionId: "next_page", label: "Next" };
  expect(pluginSurfaceSpecSchema.parse({ ...button, disabled: { $state: "noSearch" } })).toMatchObject({ disabled: { $state: "noSearch" } });
  expect(pluginSurfaceSpecSchema.parse({ ...button, disabled: true })).toMatchObject({ disabled: true });
  expect(pluginSurfaceSpecSchema.safeParse({ ...button, disabled: "yes" }).success).toBe(false);
});
