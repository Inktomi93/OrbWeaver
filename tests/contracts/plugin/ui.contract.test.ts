// Contract tests for @orb/contracts/plugin/ui (#679 plugin-ui-plane U0, seam 3): the declarative surface-spec
// vocabulary, through U5 (seam 16). The closed axes (the six anchors incl. `page`/`dialog`; tiers; the 20 node
// kinds), the zod gate at the
// node and SPEC-root levels (the global node/depth/byte caps that a per-node schema can never see), the
// `$state` binding, and the impersonation-wall clamps that ride the vocabulary (no `primary` button, no
// unknown kind, ident-only form keys). Mirror of ui.ts.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  coercePluginCommandArgs,
  HOST_FUNCTION_CAPABILITY,
  isUiProxyableHostFunction,
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_COMMAND_ARG_TYPES,
  PLUGIN_COMMAND_ARGS_DECLARED_MAX,
  PLUGIN_COMMAND_DESCRIBE_MAX,
  PLUGIN_FOOTER_MAX_DEPTH,
  PLUGIN_FOOTER_MAX_NODES,
  PLUGIN_FOOTER_NODE_KIND_ALLOWED,
  PLUGIN_FRAME_CSS_MAX_CHARS,
  PLUGIN_FRAME_HTML_MAX_CHARS,
  PLUGIN_GRID_TILES_MAX,
  PLUGIN_NODE_KINDS,
  PLUGIN_ROWS_MAX,
  PLUGIN_SPEC_MAX_BYTES,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SPEC_MAX_NODES,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TIER_REGISTRAR,
  PLUGIN_TIER_REGISTRARS,
  PLUGIN_TOAST_LEVELS,
  PLUGIN_TOOL_NAME_PREFIX,
  PLUGIN_TOOL_NAME_RE,
  pluginCommandArgSpecSchema,
  pluginCommandArgsSchema,
  pluginCommandRegistrationMetaSchema,
  pluginFrameBodySchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
  pluginToolWireName,
  UI_PROXYABLE_HOST_FUNCTIONS,
} from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures.ts";

test("PLUGIN_SURFACE_ANCHORS is the merged anchor set — U6's `message-footer`, then U5's `page` + `dialog`", () => {
  expect(PLUGIN_SURFACE_ANCHORS).toEqual(["settings", "chat-flank", "chat-settings-section", "tool-card", "message-footer", "page", "dialog"]);
});

test("PLUGIN_SURFACE_TIERS is the three-tier axis [static, scripted, frame] (U7 added the hatch)", () => {
  expect(PLUGIN_SURFACE_TIERS).toEqual(["static", "scripted", "frame"]);
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
    // U5/U7 resident registrations — a COMMAND (the `register` mirror) and the `ui.frame` ESCAPE-HATCH door are
    // the same process-lifetime, server-guest-owned class: a client UI guest holds `orb.ui(1)`, not
    // `orb.host(1)`, and could no more register a command or mint a frame than register a tool.
    "ui.registerCommand",
    "ui.registerFrame",
    // U5 HOST-MEDIATED affordances (§4.5a) — `toast`/`openDialog` are UI EFFECTS the SERVER mediates (the outbox
    // stamps the plugin name and drains onto a client round-trip), not DATA the client guest lacks. The relay
    // exists for server-owned data (chat/vars/storage); routing a toast through it would be a round-trip for an
    // effect the server pushes back to the SAME client, contradicting the Tier-C ZERO-NETWORK property. If a
    // scripted surface should ever raise one, that is a CLIENT UI-plane affordance (an `orb.ui(1)` method wired
    // to the client host), a deliberate §5a enablement — never a free proxyable-tuple entry.
    "ui.toast",
    "ui.openDialog",
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
    // U8 CANON-WRITE class — OUT. Not room-authority writes (no `canWrite` gate — a library write is the
    // installer's own), but WRITES all the same that mint durable rows + kick derived-index compute; the Tier-C
    // tuple is deliberately reads + the two KV planes (§4.6 bought LATENCY for local-immediate interaction,
    // which needs reads). A scripted surface that wants an ingest fires an `actionId` round-trip whose SERVER
    // handler holds the grant — the plugin's server guest ingests under the same grant, nothing is lost.
    "databank.ingest",
    "character.ingest",
    // U8 D148 per-card state — BOTH OUT. `setCardData` is a WRITE (the canon-write class above). `getCardData` IS
    // a read, but its owner-scope is per-CHARACTER and a proxied call names a `characterId` the server would owe an
    // ownership check on (the `chat.current`/row-777 shape, one plane over) — a gate that does not exist yet, so it
    // is a PRICED widening, never a free proxyable entry (the tuple header states this).
    "character.setCardData",
    "character.getCardData",
    // U8 §5a PRIVATE-EVENT plane — OUT. `pubsub.on` is a RESIDENT registration (a subscriber owned by the server
    // guest, the `events.on` class); `pubsub.emit` is an EFFECT fanning out to resident server guests. Neither is
    // server-owned DATA a client guest lacks — the private-event plane is a server-guest composition primitive,
    // not something a browser worker relays through the read tuple.
    "pubsub.emit",
    "pubsub.on",
  ];
  for (const fn of excluded) {
    expect(isUiProxyableHostFunction(fn), fn).toBe(false);
  }
  // Together with the ordered pin above, these two tests are exhaustive over `HOST_FUNCTION_CAPABILITY`: 9 in,
  // 26 out, 35 total.
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

// ── U7: the `ui.frame` ESCAPE HATCH (plugin-ui-plane §6.2, seam 13) ───────────────────────────────────────────
// Three walls live in this file, and each one exists because the alternative is a silent widening: which ANCHORS
// admit a frame, which HOST FUNCTION may mint one (hence which capability, hence which consent line), and what a
// frame body may weigh.

test("PLUGIN_TIER_REGISTRAR is TOTAL — every tier names the host function that mints it, so none inherits a door", () => {
  for (const tier of PLUGIN_SURFACE_TIERS) {
    expect(PLUGIN_TIER_REGISTRARS).toContain(PLUGIN_TIER_REGISTRAR[tier]);
  }
  // The FORK itself: the declarative tiers ride `ui.register` (capability `ui.surface`); the frame tier rides
  // `ui.registerFrame` (capability `ui.frame`). If `frame` ever mapped to `ui.register`, a plugin granted only
  // "show its own panels" could open an isolated frame by naming a tier.
  expect(PLUGIN_TIER_REGISTRAR.static).toBe("ui.register");
  expect(PLUGIN_TIER_REGISTRAR.scripted).toBe("ui.register");
  expect(PLUGIN_TIER_REGISTRAR.frame).toBe("ui.registerFrame");
});

test("the `frame` column of PLUGIN_ANCHOR_TIERS is the §6.2 anchor list — and message-footer is FALSE permanently", () => {
  // ADMITTED: the hatch's own anchors (§6.2) — the flank (the owner test's chess board), the installer's own
  // settings screen (§6.1's arbitrary-HTML row), and tool cards (§6.1's arbitrary card art, lazy).
  expect(PLUGIN_ANCHOR_TIERS["chat-flank"].frame).toBe(true);
  expect(PLUGIN_ANCHOR_TIERS.settings.frame).toBe(true);
  expect(PLUGIN_ANCHOR_TIERS["tool-card"].frame).toBe(true);
  // REFUSED, and both refusals are decisions rather than omissions. `message-footer` is PERMANENT: one document
  // per transcript row. `chat-settings-section` is the host-controls band, which §6.2's anchor list does not name.
  expect(PLUGIN_ANCHOR_TIERS["message-footer"].frame).toBe(false);
  expect(PLUGIN_ANCHOR_TIERS["chat-settings-section"].frame).toBe(false);
});

test("a frame surface is REFUSED at message-footer and admitted at the flank — the anchor belt bites on the new tier", () => {
  const frameAt = (anchor: string): unknown => ({ id: "board", anchor, title: "Board", tier: "frame" });
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(frameAt("chat-flank")).success).toBe(true);
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(frameAt("message-footer")).success).toBe(false);
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(frameAt("chat-settings-section")).success).toBe(false);
});

test("a frame surface names NO spec — a document and a node tree are not two descriptions of one surface", () => {
  const base = { id: "board", anchor: "chat-flank", title: "Board", tier: "frame" } as const;
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(base).success).toBe(true);
  // A spec smuggled onto a frame registration would be a declarative surface for a plugin that may hold only
  // `ui.frame` — the fork laundered through the OTHER field.
  expect(pluginSurfaceRegistrationMetaSchema.safeParse({ ...base, spec: { kind: "text", value: "hi" } }).success).toBe(false);
});

test("the frame BODY schema bounds size and nothing else — arbitrary pixels is the tier, the response CSP is the wall", () => {
  expect(pluginFrameBodySchema.safeParse({ html: "<canvas id=board></canvas><script>draw()</script>" }).success).toBe(true);
  expect(pluginFrameBodySchema.safeParse({ html: "<div/>", css: "body{margin:0}" }).success).toBe(true);
  // The CONTENT is deliberately unconstrained: a script tag is the whole point of the tier, and pretending this
  // schema is a sanitizer would teach the next reader that the isolation lives here rather than in the policy.
  expect(pluginFrameBodySchema.safeParse({ html: "<script>fetch('https://evil')</script>" }).success).toBe(true);
  // What IS bounded: the bytes, on both fields…
  expect(pluginFrameBodySchema.safeParse({ html: "x".repeat(PLUGIN_FRAME_HTML_MAX_CHARS + 1) }).success).toBe(false);
  expect(pluginFrameBodySchema.safeParse({ html: "<p/>", css: "x".repeat(PLUGIN_FRAME_CSS_MAX_CHARS + 1) }).success).toBe(false);
  // …and the SHAPE: `strictObject`, so a smuggled key is a reject rather than a silent strip.
  expect(pluginFrameBodySchema.safeParse({ html: "<p/>", src: "https://evil.example" }).success).toBe(false);
  expect(pluginFrameBodySchema.safeParse({ css: "body{}" }).success).toBe(false);
});

test("PLUGIN_NODE_KINDS is the pinned 20-kind vocabulary in §4.3 order (U5 appended the browse genre)", () => {
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

// ── U5: the BROWSE-GENRE vocabulary + the host-mediated affordance grammar (§4.5a/§4.5b, seam 16) ──────────

test("a browse page is spellable end to end: searchBar + grid inside a masterDetail arrangement", () => {
  const page: PluginSurfaceSpec = {
    kind: "masterDetail",
    active: { $state: "stage" },
    stages: [
      {
        id: "browse",
        kind: "browse",
        title: "Results",
        body: {
          kind: "stack",
          children: [
            { kind: "searchBar", name: "q", label: "Search", actionId: "search", filters: [{ kind: "toggle", name: "nsfw", label: "Include NSFW" }] },
            {
              kind: "grid",
              aspect: "portrait",
              empty: "No results yet — try a search.",
              tiles: [{ id: "a1", title: { $state: "results.0.name" }, subtitle: "by someone", actionId: "open" }],
            },
          ],
        },
      },
      { id: "detail", kind: "detail", title: { $state: "picked.name" }, body: { kind: "markdown", value: { $state: "picked.description" } } },
    ],
  };
  expect(pluginSurfaceSpecSchema.safeParse(page).success).toBe(true);
});

test("at most ONE searchBar per spec — 'prominent' is a claim two of them refute (§4.5b failure 3)", () => {
  const two: PluginSurfaceSpec = {
    kind: "stack",
    children: [
      { kind: "searchBar", name: "q", label: "Search" },
      { kind: "searchBar", name: "q2", label: "Search again" },
    ],
  };
  expect(pluginSurfaceSpecSchema.safeParse(two).success).toBe(false);
  const one: PluginSurfaceSpec = { kind: "stack", children: [{ kind: "searchBar", name: "q", label: "Search" }] };
  expect(pluginSurfaceSpecSchema.safeParse(one).success).toBe(true);
});

test("the global caps SEE THROUGH the U5 recursion — masterDetail stage bodies and searchBar filters both count", () => {
  // THE HAZARD THIS PINS: `masterDetail`/`searchBar` carry children under fields that are NOT called `children`,
  // so a cap walk that only knew the three container kinds would report a passing node count over an
  // arbitrarily deep subtree. Both arms below are over a cap that is only reachable THROUGH the new field.
  let deep: PluginSurfaceSpec = { kind: "text", value: "leaf" };
  for (let i = 0; i < PLUGIN_SPEC_MAX_DEPTH; i++) {
    deep = { kind: "masterDetail", stages: [{ id: "s", kind: "browse", body: deep }] };
  }
  expect(pluginSurfaceSpecSchema.safeParse(deep).success).toBe(false);

  const manyFilters: PluginSurfaceSpec = {
    kind: "searchBar",
    name: "q",
    label: "Search",
    filters: Array.from({ length: PLUGIN_SPEC_MAX_NODES }, () => ({ kind: "text", value: "n" }) as const),
  };
  expect(pluginSurfaceSpecSchema.safeParse(manyFilters).success).toBe(false);
});

test("a grid refuses more tiles than the cap, and a tile's cover is an ASSET id — never a URL (the exfil wall)", () => {
  const tiles = Array.from({ length: PLUGIN_GRID_TILES_MAX + 1 }, (_, i) => ({ id: `t${i}`, title: `T${i}` }));
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid", tiles }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid", tiles: [{ id: "t", title: "T", assetId: "https://evil.example/x.png" }] }).success).toBe(false);
});

test("a masterDetail needs at least one stage — a page arrangement that renders nothing is not a state", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "masterDetail", stages: [] }).success).toBe(false);
});

test("a plugin COMMAND's name is the guest-local ident grammar and its help is required + capped", () => {
  expect(pluginCommandRegistrationMetaSchema.safeParse({ name: "draw", describe: "Draw a card" }).success).toBe(true);
  expect(pluginCommandRegistrationMetaSchema.safeParse({ name: "Draw Card", describe: "Draw a card" }).success).toBe(false);
  expect(pluginCommandRegistrationMetaSchema.safeParse({ name: "draw", describe: "" }).success).toBe(false);
  expect(pluginCommandRegistrationMetaSchema.safeParse({ name: "draw", describe: "x".repeat(PLUGIN_COMMAND_DESCRIBE_MAX + 1) }).success).toBe(false);
});

// ── #791: the TYPED-ARG grammar ────────────────────────────────────────────────────────────────────────────────

test("PLUGIN_COMMAND_ARG_TYPES is the clean closed set [string, number, enum, boolean]", () => {
  expect(PLUGIN_COMMAND_ARG_TYPES).toEqual(["string", "number", "enum", "boolean"]);
});

test("#791: a declared arg enforces the enum BICONDITIONAL — enumValues iff type is enum", () => {
  expect(pluginCommandArgSpecSchema.safeParse({ name: "suit", type: "enum", enumValues: ["cups", "wands"] }).success).toBe(true);
  // enum without values, and values on a non-enum, are both refused.
  expect(pluginCommandArgSpecSchema.safeParse({ name: "suit", type: "enum" }).success).toBe(false);
  expect(pluginCommandArgSpecSchema.safeParse({ name: "n", type: "number", enumValues: ["1"] }).success).toBe(false);
  // the name is the values-bag ident grammar.
  expect(pluginCommandArgSpecSchema.safeParse({ name: "Suit", type: "string" }).success).toBe(false);
});

test("#791: a command's declared args cap out and reject duplicate names", () => {
  const spec = (name: string): unknown => ({ name, type: "string" });
  expect(pluginCommandRegistrationMetaSchema.safeParse({ name: "cast", describe: "x", args: [spec("a"), spec("b")] }).success).toBe(true);
  expect(pluginCommandRegistrationMetaSchema.safeParse({ name: "cast", describe: "x", args: [spec("dup"), spec("dup")] }).success).toBe(false);
  expect(
    pluginCommandRegistrationMetaSchema.safeParse({
      name: "cast",
      describe: "x",
      args: Array.from({ length: PLUGIN_COMMAND_ARGS_DECLARED_MAX + 1 }, (_v, i) => spec(`a${i}`)),
    }).success,
  ).toBe(false);
});

test("#791: coercePluginCommandArgs types raw strings and reports a human error per offending arg", () => {
  const specs = [
    { name: "suit", type: "enum" as const, required: true, enumValues: ["cups", "wands"] },
    { name: "count", type: "number" as const },
    { name: "loud", type: "boolean" as const },
  ];
  // The happy path: enum stays a string, number becomes a number, boolean becomes a boolean.
  expect(coercePluginCommandArgs(specs, { suit: "cups", count: "3", loud: "true" })).toEqual({
    values: { suit: "cups", count: 3, loud: true },
    errors: [],
  });
  // A missing required, an off-enum, a non-number — each a sentence; the valid ones still coerce.
  const bad = coercePluginCommandArgs(specs, { count: "lots" });
  expect(bad.values).toEqual({});
  expect(bad.errors).toHaveLength(2); // suit required + count not a number
});

test("#791: pluginCommandArgsSchema is the MEMBRANE re-validation over an already-typed bag", () => {
  const specs = [
    { name: "suit", type: "enum" as const, required: true, enumValues: ["cups", "wands"] },
    { name: "count", type: "number" as const },
  ];
  const schema = pluginCommandArgsSchema(specs);
  expect(schema.safeParse({ suit: "cups", count: 2 }).success).toBe(true);
  // required missing, off-enum, and a mistyped number are all refused; an extra key is STRIPPED (the guest sees
  // only declared args).
  expect(schema.safeParse({ count: 2 }).success).toBe(false);
  expect(schema.safeParse({ suit: "swords" }).success).toBe(false);
  expect(schema.safeParse({ suit: "cups", count: "2" }).success).toBe(false);
  const stripped = schema.safeParse({ suit: "cups", extra: "dropped" });
  expect(stripped.success && stripped.data).toEqual({ suit: "cups" });
});

test("PLUGIN_TOAST_LEVELS is the HOUSE notify vocabulary — a plugin gets no severity the app cannot render", () => {
  expect(PLUGIN_TOAST_LEVELS).toEqual(["info", "success", "warn", "error"]);
});

test("pluginToolWireName is the ONE mint: hyphens in the slug become underscores, and it carries the claimed prefix", () => {
  // The charset half: the OpenAI/MCP function-name grammar has no hyphen, so the slug is transliterated. A
  // second spelling of this rule anywhere would silently unmatch every registered card.
  expect(pluginToolWireName("oracle-deck", "draw")).toBe("plugin_oracle_deck_draw");
  expect(pluginToolWireName("mood", "read")).toBe("plugin_mood_read");
  // …and the prefix the client's ONE `pluginToolRenderer` claims is the prefix this mint emits.
  expect(pluginToolWireName("oracle-deck", "draw").startsWith(PLUGIN_TOOL_NAME_PREFIX)).toBe(true);
});
