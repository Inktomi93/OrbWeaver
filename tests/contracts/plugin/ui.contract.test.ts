// Contract tests for @orb/contracts/plugin/ui (#679 plugin-ui-plane U0, seam 3): the declarative surface-spec
// vocabulary. The closed axes (anchors — page DEFERRED to U5; tiers; the 17 node kinds), the zod gate at the
// node and SPEC-root levels (the global node/depth/byte caps that a per-node schema can never see), the
// `$state` binding, and the impersonation-wall clamps that ride the vocabulary (no `primary` button, no
// unknown kind, ident-only form keys). Mirror of ui.ts.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  isUiProxyableHostFunction,
  PLUGIN_NODE_KINDS,
  PLUGIN_ROWS_MAX,
  PLUGIN_SPEC_MAX_BYTES,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SPEC_MAX_NODES,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  pluginSurfaceSpecSchema,
  UI_PROXYABLE_HOST_FUNCTIONS,
} from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures.ts";

test("PLUGIN_SURFACE_ANCHORS is the pinned U0 anchor set — `page` is DEFERRED to U5 (seam 16)", () => {
  expect(PLUGIN_SURFACE_ANCHORS).toEqual(["settings", "chat-flank", "chat-settings-section", "tool-card"]);
  // The root-slot-lands-with-occupant rule: `page` has no first-party mount until U5, so it is NOT in the tuple.
  expect((PLUGIN_SURFACE_ANCHORS as readonly string[]).includes("page")).toBe(false);
});

test("PLUGIN_SURFACE_TIERS is the two-tier axis [static, scripted]", () => {
  expect(PLUGIN_SURFACE_TIERS).toEqual(["static", "scripted"]);
});

// ── Tier C (U4, §4.6) — the PROXY SUBSET, pinned by VALUE ────────────────────────────────────────────────────
// `satisfies readonly HostFunctionRef[]` makes every member a real host function at compile time, but it says
// nothing about which ones are in the set — and the membership IS the security property (§9's "capability
// escalation" row). An ordered `toEqual` is what makes ADDING a member a deliberate, reviewable act rather than
// a one-line diff nobody notices, which is exactly the reason `PLUGIN_CAPABILITIES` carries the same pin.
test("UI_PROXYABLE_HOST_FUNCTIONS is the pinned U4 subset — reads + the two KV planes, and nothing else", () => {
  expect(UI_PROXYABLE_HOST_FUNCTIONS).toEqual([
    "chat.listMessages",
    "chat.getVariables",
    "variables.get",
    "variables.set",
    "variables.delete",
    "storage.get",
    "storage.set",
    "storage.delete",
    "storage.list",
  ]);
});

test("the EXCLUSIONS are excluded — residency, authority writes, spend, and egress are unspellable from a client guest", () => {
  // Named individually rather than asserted as "not in the list", because each is a different refusal with a
  // different reason recorded at the tuple, and a future widening should have to delete a NAMED line here.
  const excluded = [
    // Resident registrations — process-lifetime state owned by the SERVER guest (§4.6 names the first three).
    "tools.register",
    "transforms.register",
    "events.on",
    "ui.register",
    "ui.setState",
    // No invocation to resolve.
    "chat.current",
    // The AUTHORITY-WRITE class — each gated on `InvocationChat.canWrite`, whose sanctioned client-side route is
    // the S4 propose/confirm posture, never a direct proxy.
    "chat.applyVariableOps",
    "chat.surfaceQuickReply",
    "chat.requestTurn",
    "worldInfo.upsertEntry",
    "imagery.generatePicture",
    "llm.quiet",
    "notifications.post",
    // STRUCTURAL, not a judgment call: the fetch is not on the `PluginBridge` at all (infra performs it behind
    // the SSRF guard; the bridge carries only the hourly admission), so proxying it would require a SECOND
    // egress path. See the tuple's header.
    "net.fetch",
  ];
  for (const fn of excluded) {
    expect(isUiProxyableHostFunction(fn), fn).toBe(false);
  }
  // Together with the ordered pin above, these two tests are exhaustive over `HOST_FUNCTION_CAPABILITY`: 9 in,
  // 14 out, 23 total.
  expect(UI_PROXYABLE_HOST_FUNCTIONS.length + excluded.length).toBe(Object.keys(HOST_FUNCTION_CAPABILITY).length);
});

test("every proxyable fn names a capability — the re-gate has something to check", () => {
  // The `uiHostCall` grant rung is `HOST_FUNCTION_CAPABILITY[fn] ∈ the stored grant`. A member with no row in
  // that map would make the lookup `undefined` and the `includes` check silently false-y — this pins that the
  // situation cannot arise.
  for (const fn of UI_PROXYABLE_HOST_FUNCTIONS) {
    expect(HOST_FUNCTION_CAPABILITY[fn], fn).toBeDefined();
  }
});

test("PLUGIN_NODE_KINDS is the pinned 17-kind vocabulary in §4.3 order", () => {
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

test("a button cannot be `primary` — that stays CONTENT's one primary", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "button", actionId: "go", label: "Go", variant: "primary" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "button", actionId: "go", label: "Go", variant: "neutral" }).success).toBe(true);
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
