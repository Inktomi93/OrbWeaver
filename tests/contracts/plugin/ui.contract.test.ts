// Contract tests for @orb/contracts/plugin/ui (#679 plugin-ui-plane U0, seam 3): the declarative surface-spec
// vocabulary. The closed axes (anchors — page DEFERRED to U5; tiers; the 17 node kinds), the zod gate at the
// node and SPEC-root levels (the global node/depth/byte caps that a per-node schema can never see), the
// `$state` binding, and the impersonation-wall clamps that ride the vocabulary (no `primary` button, no
// unknown kind, ident-only form keys). Mirror of ui.ts.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  isUiProxyableHostFunction,
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_FOOTER_MAX_DEPTH,
  PLUGIN_FOOTER_MAX_NODES,
  PLUGIN_FOOTER_NODE_KIND_ALLOWED,
  PLUGIN_NODE_KINDS,
  PLUGIN_ROWS_MAX,
  PLUGIN_SPEC_MAX_BYTES,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SPEC_MAX_NODES,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TOOL_NAME_PREFIX,
  PLUGIN_TOOL_NAME_RE,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
  pluginToolWireName,
  UI_PROXYABLE_HOST_FUNCTIONS,
} from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures.ts";

test("PLUGIN_SURFACE_ANCHORS is the pinned anchor set (U6 added `message-footer`) — `page` is DEFERRED to U5 (seam 16)", () => {
  expect(PLUGIN_SURFACE_ANCHORS).toEqual(["settings", "chat-flank", "chat-settings-section", "tool-card", "message-footer"]);
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
    // U6 resident registrations — a DISPLAY transform (seam 14) and a macro (`macros.register`) are the same
    // process-lifetime, server-guest-owned class as the four around them: a client UI guest holds `orb.ui(1)`,
    // not `orb.host(1)`, and could no more register a resident than it could register a tool.
    "transforms.registerDisplay",
    "macros.register",
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
  // 16 out, 25 total.
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

// ── The `message-footer` PER-ROW anchor (U6, §5.4) — the three clamps, each at the tier that enforces it ─────
// This anchor mounts once per COMMITTED transcript row, so its cost multiplies by transcript length. The design
// bans a scripted (and, at U7, a framed) tier there PERMANENTLY, caps the tree hard, and admits decoration
// kinds only. These pins are what make those sentences facts rather than prose.

/** One well-formed footer registration, minus whatever the caller overrides. */
function footerMeta(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "badges", anchor: "message-footer", title: "Badges", tier: "static", spec: { kind: "badge", text: "seen" }, ...over };
}

test("message-footer admits the STATIC tier and refuses SCRIPTED permanently (a per-row interpreter is unspellable)", () => {
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta()).success).toBe(true);
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta({ tier: "scripted" })).success).toBe(false);
  // …and the same tier IS admitted at a room-level anchor, so the refusal is the ANCHOR's, not a global ban.
  const flank = { id: "panel", anchor: "chat-flank", title: "Panel", tier: "scripted" };
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(flank).success).toBe(true);
});

test("PLUGIN_ANCHOR_TIERS is TOTAL over both axes — a new tier cannot inherit message-footer admission by silence", () => {
  // The table is the compile-tier half of the same refusal (a new `PLUGIN_SURFACE_TIERS` member makes every
  // anchor row a missing key). This runtime mirror asserts the shape the `satisfies` guarantees.
  for (const anchor of PLUGIN_SURFACE_ANCHORS) {
    for (const tier of PLUGIN_SURFACE_TIERS) {
      expect(typeof PLUGIN_ANCHOR_TIERS[anchor][tier]).toBe("boolean");
    }
  }
  expect(PLUGIN_ANCHOR_TIERS["message-footer"].scripted).toBe(false);
});

test(`a message-footer spec is capped at ${PLUGIN_FOOTER_MAX_NODES} nodes and depth ${PLUGIN_FOOTER_MAX_DEPTH} — far under the whole-tree caps`, () => {
  const badges = Array.from({ length: PLUGIN_FOOTER_MAX_NODES }, () => ({ kind: "badge", text: "b" }) as const);
  const over = { kind: "row", children: badges } as const; // row + N badges = MAX + 1 nodes
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta({ spec: over })).success).toBe(false);
  // The same tree is fine at a ROOM-level anchor: the cap belongs to the per-row anchor, not to the vocabulary.
  expect(pluginSurfaceRegistrationMetaSchema.safeParse({ id: "p", anchor: "settings", title: "P", tier: "static", spec: over }).success).toBe(true);

  const tooDeep = { kind: "row", children: [{ kind: "row", children: [{ kind: "badge", text: "b" }] }] } as const;
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta({ spec: tooDeep })).success).toBe(false);
});

test("message-footer admits DECORATION kinds only — interactive, bulk and prose kinds are refused at registration", () => {
  // The three exclusion classes of §5.4, one probe each: an action round-trip per row, a 64-row list under
  // every message, and in-bubble markup by another name.
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta({ spec: { kind: "button", actionId: "go", label: "Go" } })).success).toBe(false);
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta({ spec: { kind: "list", items: ["a"] } })).success).toBe(false);
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta({ spec: { kind: "markdown", value: "**hi**" } })).success).toBe(false);
  // A refused kind nested inside an admitted container is caught too (the walk is over the whole tree).
  const nested = {
    kind: "row",
    children: [
      { kind: "badge", text: "ok" },
      { kind: "toggle", name: "t", label: "T" },
    ],
  } as const;
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta({ spec: nested })).success).toBe(false);
  // …and the admitted set renders: row / text / badge / meter / image are the decoration grammar.
  const strip = {
    kind: "row",
    children: [
      { kind: "badge", text: "seen" },
      { kind: "text", value: "3s", voice: "gloss" },
    ],
  } as const;
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(footerMeta({ spec: strip })).success).toBe(true);
});

test("PLUGIN_FOOTER_NODE_KIND_ALLOWED is TOTAL over the node vocabulary — a new kind must be decided FOR the transcript", () => {
  for (const kind of PLUGIN_NODE_KINDS) {
    expect(typeof PLUGIN_FOOTER_NODE_KIND_ALLOWED[kind]).toBe("boolean");
  }
});

// ── U3: the `tool-card` LINKAGE (plugin-ui-plane §4.5's tool-card row) ────────────────────────────────────
// A card names WHICH tool it draws, and the name it uses is the plugin's OWN (`host.tools.register`'s), never
// the namespaced wire name. The two halves below are the same registration refusal (§4.9): a stale linkage
// costs the generic tool block and a log line, never the plugin's activation.

test("a tool-card surface MUST name its tool, and only a tool-card surface may name one", () => {
  const spec = { kind: "text", value: "drawn" } as const;
  const base = { id: "draw_card", title: "Draw", tier: "static", spec } as const;

  // The well-formed card.
  expect(pluginSurfaceRegistrationMetaSchema.safeParse({ ...base, anchor: "tool-card", toolName: "draw" }).success).toBe(true);
  // A card with NO linkage is a card nobody can reach — no tool call could ever match it.
  expect(pluginSurfaceRegistrationMetaSchema.safeParse({ ...base, anchor: "tool-card" }).success).toBe(false);
  // …and a linkage on any OTHER anchor is a claim the renderer would never honour.
  expect(pluginSurfaceRegistrationMetaSchema.safeParse({ ...base, anchor: "settings", toolName: "draw" }).success).toBe(false);
  expect(pluginSurfaceRegistrationMetaSchema.safeParse({ ...base, anchor: "settings" }).success).toBe(true);

  // The name is the GUEST-LOCAL grammar — arbitrary display text is not a legal `toolName`, and the wire name
  // the server derives from one is itself well-formed in the same charset (nothing here re-derives it).
  expect(pluginSurfaceRegistrationMetaSchema.safeParse({ ...base, anchor: "tool-card", toolName: "Draw Card" }).success).toBe(false);
  expect(PLUGIN_TOOL_NAME_RE.test("draw")).toBe(true);
});

test("pluginToolWireName is the ONE mint: hyphens in the slug become underscores, and it carries the claimed prefix", () => {
  // The charset half: the OpenAI/MCP function-name grammar has no hyphen, so the slug is transliterated. A
  // second spelling of this rule anywhere would silently unmatch every registered card.
  expect(pluginToolWireName("oracle-deck", "draw")).toBe("plugin_oracle_deck_draw");
  expect(pluginToolWireName("mood", "read")).toBe("plugin_mood_read");
  // …and the prefix the client's ONE `pluginToolRenderer` claims is the prefix this mint emits.
  expect(pluginToolWireName("oracle-deck", "draw").startsWith(PLUGIN_TOOL_NAME_PREFIX)).toBe(true);
});
