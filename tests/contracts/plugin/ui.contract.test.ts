// Contract tests for @orb/contracts/plugin/ui (#679 plugin-ui-plane U0, seam 3): the declarative surface-spec
// vocabulary, through U5 (seam 16). The closed axes (the six anchors incl. `page`/`dialog`; tiers; the 20 node
// kinds), the zod gate at the
// node and SPEC-root levels (the global node/depth/byte caps that a per-node schema can never see), the
// `$state` binding, and the impersonation-wall clamps that ride the vocabulary (no unknown kind, no
// raw HTML, ident-only form keys) — plus the #818 per-anchor `primary` arbitration, which is the ONE rule
// here that parse deliberately does NOT enforce. Mirror of ui.ts.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  coercePluginCommandArgs,
  HOST_FUNCTION_CAPABILITY,
  isUiProxyableHostFunction,
  PLUGIN_ANCHOR_PRIMARY_ALLOWED,
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_BUTTON_VARIANTS,
  PLUGIN_COMMAND_ARG_TYPES,
  PLUGIN_COMMAND_ARGS_DECLARED_MAX,
  PLUGIN_COMMAND_DESCRIBE_MAX,
  PLUGIN_FOOTER_MAX_DEPTH,
  PLUGIN_FOOTER_MAX_NODES,
  PLUGIN_FOOTER_NODE_KIND_ALLOWED,
  PLUGIN_FRAME_CSS_MAX_CHARS,
  PLUGIN_FRAME_HTML_MAX_CHARS,
  PLUGIN_GRID_TILES_MAX,
  PLUGIN_ICON_NAMES,
  PLUGIN_NODE_KINDS,
  PLUGIN_ROWS_MAX,
  PLUGIN_SPEC_MAX_BYTES,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SPEC_MAX_NODES,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TABS_OPTIONS_MAX,
  PLUGIN_TEXT_MAX_BYTES,
  PLUGIN_TIER_REGISTRAR,
  PLUGIN_TIER_REGISTRARS,
  PLUGIN_TILE_TAGS_MAX,
  PLUGIN_TOAST_LEVELS,
  PLUGIN_TOOL_NAME_LOCAL_MAX,
  PLUGIN_TOOL_NAME_PREFIX,
  PLUGIN_TOOL_NAME_RE,
  pluginBoundGridTileSchema,
  pluginCommandArgSpecSchema,
  pluginCommandArgsSchema,
  pluginCommandRegistrationMetaSchema,
  pluginFrameBodySchema,
  pluginSlugSchema,
  pluginSurfaceNodeSchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
  pluginToolWireName,
  resolvePluginBoundAssetId,
  resolvePluginBoundBoolean,
  resolvePluginBoundKeyValueRows,
  resolvePluginBoundSelectOptions,
  resolvePluginBoundTabOptions,
  resolvePluginBoundTiles,
  resolvePluginPrimaryButton,
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
    // #1442 — the ATOMIC KV write. IN, and the classification is forced rather than preferred: it is a
    // `storage.kv`-plane DATA op whose reach is strictly NARROWER than `storage.set` two lines up (same grant,
    // same owner scope, a precondition added, no new ownership check, no compute cost). Excluding it would
    // leave a scripted surface — which does the same read-modify-write on the same keys the server guest does
    // — with no lost-update-free write at all, which is the defect rather than a limit.
    "storage.compareAndSet",
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
    // #798 — the remote-image fetch-into-CAS is OUT for the SAME structural reason as `net.fetch`: infra performs
    // the fetch behind the SSRF guard + the image guard, so a proxy would need a second egress+CAS-write path.
    "net.fetchAsset",
    // U8 CANON-WRITE class — OUT. Not room-authority writes (no `canWrite` gate — a library write is the
    // installer's own), but WRITES all the same that mint durable rows + kick derived-index compute; the Tier-C
    // tuple is deliberately reads + the two KV planes (§4.6 bought LATENCY for local-immediate interaction,
    // which needs reads). A scripted surface that wants an ingest fires an `actionId` round-trip whose SERVER
    // handler holds the grant — the plugin's server guest ingests under the same grant, nothing is lost.
    "databank.ingest",
    "character.ingest",
    // #798 — the remote-image "summon with art" arm is a CANON WRITE (a character import), the `character.ingest`
    // class, so it is OUT for the same reason: a scripted surface fires an `actionId` round-trip whose server
    // guest holds the grant, never a direct proxy.
    "character.ingestAsset",
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
    // #788 the READ gaps — ALL FOUR OUT, each a PRICED widening (never a free entry), for the reasons the tuple
    // header records. `chat.listCharacters` is the strongest future candidate (same class as the proxyable
    // `listMessages` — a chat-scoped read a surface renders from, self-gating membership), but adding a member is
    // a deliberate ordered-pin edit, not a lane's side effect. `worldInfo.listBooks`/`listEntries` are chat-scoped
    // reads whose consumer is server-side indexing, weak latency want. `assets.read` is the `character.getCardData`
    // shape one plane over — its owner-scope is per-ASSET, and a proxied call names an id the server would owe an
    // ownership check on, a gate not built here.
    "chat.listCharacters",
    "worldInfo.listBooks",
    "worldInfo.listEntries",
    "assets.read",
    // #788 F1 — first-party retrieval. An owner-scoped read (needs no new ownership gate to proxy), but every
    // call runs a query embedding (local box compute), so it is the COMPUTE-COST class the read tuple keeps out
    // (§4.6 bought latency over cheap reads, not per-keystroke retrieval). Priced widening, never a free entry.
    "search.documents",
  ];
  for (const fn of excluded) {
    expect(isUiProxyableHostFunction(fn), fn).toBe(false);
  }
  // Together with the ordered pin above, these two tests are exhaustive over `HOST_FUNCTION_CAPABILITY`: 10 in,
  // 33 out, 43 total (#798 added `net.fetchAsset` + `character.ingestAsset`, both OUT; #1442 added
  // `storage.compareAndSet`, IN).
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
  // settings screen (§6.1's arbitrary-HTML row), tool cards (§6.1's arbitrary card art, lazy), and — since #787
  // wired the client mount at both — a full extension PAGE and a house DIALOG (§6.2 names both; the U5×U7 merge
  // held them false only until their `PluginFrame` mount existed).
  expect(PLUGIN_ANCHOR_TIERS["chat-flank"].frame).toBe(true);
  expect(PLUGIN_ANCHOR_TIERS.settings.frame).toBe(true);
  expect(PLUGIN_ANCHOR_TIERS["tool-card"].frame).toBe(true);
  expect(PLUGIN_ANCHOR_TIERS.page.frame).toBe(true);
  expect(PLUGIN_ANCHOR_TIERS.dialog.frame).toBe(true);
  // REFUSED, and both refusals are decisions rather than omissions. `message-footer` is PERMANENT: one document
  // per transcript row. `chat-settings-section` is the host-controls band, which §6.2's anchor list does not name.
  expect(PLUGIN_ANCHOR_TIERS["message-footer"].frame).toBe(false);
  expect(PLUGIN_ANCHOR_TIERS["chat-settings-section"].frame).toBe(false);
});

test("a frame surface is REFUSED at message-footer and admitted at the flank/page/dialog — the anchor belt bites on the new tier", () => {
  const frameAt = (anchor: string): unknown => ({ id: "board", anchor, title: "Board", tier: "frame" });
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(frameAt("chat-flank")).success).toBe(true);
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(frameAt("page")).success).toBe(true);
  expect(pluginSurfaceRegistrationMetaSchema.safeParse(frameAt("dialog")).success).toBe(true);
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

// ── #818: the per-anchor PRIMARY arbitration (the ruling that replaced the flat clamp) ───────────────────────
// The old law here was "a button cannot be `primary`, full stop", enforced by the zod enum. The owner ruled
// 2026-08-30 that the S1 one-primary law SURVIVES with a changed INPUT: the chat band's attention budget is
// still the host's, but a `page`/`dialog` surface owns its own. So the enum admits it, PARSE stays anchor-blind
// (a spec is registered once and mounted anywhere), and the arbitration is the renderer's.

test("#818: `primary` is a spellable button weight — the enum is the three house weights, nothing more", () => {
  expect(PLUGIN_BUTTON_VARIANTS).toEqual(["neutral", "outline", "primary"]);
  for (const variant of PLUGIN_BUTTON_VARIANTS) {
    expect(pluginSurfaceSpecSchema.safeParse({ kind: "button", actionId: "go", label: "Go", variant }).success).toBe(true);
  }
  // The wall is still a wall: an off-tuple weight is a registration refusal, not a runtime miss.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "button", actionId: "go", label: "Go", variant: "destructive" }).success).toBe(false);
  // A BADGE still cannot be primary — the ruling moved the CTA line, not the decoration one.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "badge", label: "New", intent: "primary" }).success).toBe(false);
});

test("#818: PARSE is anchor-blind — TWO primaries in one spec register fine; the anchor rule is a RENDER rule", () => {
  const two: PluginSurfaceSpec = {
    kind: "stack",
    children: [
      { kind: "button", actionId: "summon", label: "Summon", variant: "primary" },
      { kind: "button", actionId: "back", label: "Back", variant: "primary" },
    ],
  };
  // Deliberate: refusing here would make a spec's admissibility depend on an anchor it is mounted at LATER,
  // and would turn a hierarchy mistake into a dead surface instead of a demoted button.
  expect(pluginSurfaceSpecSchema.safeParse(two).success).toBe(true);
});

test("#818: PLUGIN_ANCHOR_PRIMARY_ALLOWED is TOTAL, and only `page`/`dialog` own their attention budget", () => {
  for (const anchor of PLUGIN_SURFACE_ANCHORS) {
    expect(typeof PLUGIN_ANCHOR_PRIMARY_ALLOWED[anchor]).toBe("boolean");
  }
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED.page).toBe(true);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED.dialog).toBe(true);
  // Every guest-inside-host-chrome anchor keeps the clamp — the chat band above all (the S1 law's own home).
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED["chat-flank"]).toBe(false);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED["chat-settings-section"]).toBe(false);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED.settings).toBe(false);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED["tool-card"]).toBe(false);
  expect(PLUGIN_ANCHOR_PRIMARY_ALLOWED["message-footer"]).toBe(false);
});

test("#818: resolvePluginPrimaryButton grants the FIRST claimant in document order and refuses the rest", () => {
  const first = { kind: "button", actionId: "summon", label: "Summon", variant: "primary" } as const;
  const second = { kind: "button", actionId: "again", label: "Again", variant: "primary" } as const;
  const spec: PluginSurfaceSpec = {
    kind: "stack",
    children: [{ kind: "text", value: "hi" }, first, { kind: "button", actionId: "back", label: "Back" }, second],
  };
  const arbitration = resolvePluginPrimaryButton(spec, "page");
  // IDENTITY, not equality: the renderer compares by reference as it walks, so the grant must be the very node.
  expect(arbitration.granted).toBe(first);
  expect(arbitration.refused).toEqual([second]);
});

test("#818: a REFUSING anchor grants nobody — every claimant is refused, so the chat band keeps the S1 clamp", () => {
  const claim = { kind: "button", actionId: "summon", label: "Summon", variant: "primary" } as const;
  const spec: PluginSurfaceSpec = { kind: "stack", children: [claim] };
  // The chat band, named outright — the anchor the S1 law was minted for, and the one the ruling did NOT move.
  const band = resolvePluginPrimaryButton(spec, "chat-flank");
  expect(band.granted).toBeNull();
  // Refused, never DROPPED: the renderer owes the plugin's author a console line naming what it demoted.
  expect(band.refused).toEqual([claim]);
  // …and the whole anchor set agrees with the record, so a new anchor cannot pick up a grant by accident.
  const outcomes = PLUGIN_SURFACE_ANCHORS.map((anchor) => {
    const arbitration = resolvePluginPrimaryButton(spec, anchor);
    return { anchor, granted: arbitration.granted === claim, refusedCount: arbitration.refused.length };
  });
  expect(outcomes).toEqual(
    PLUGIN_SURFACE_ANCHORS.map((anchor) => ({
      anchor,
      granted: PLUGIN_ANCHOR_PRIMARY_ALLOWED[anchor],
      refusedCount: PLUGIN_ANCHOR_PRIMARY_ALLOWED[anchor] ? 0 : 1,
    })),
  );
});

test("#818: the walk reaches the NON-`children` containers — a masterDetail stage body holds the browse CTA", () => {
  const buried = { kind: "button", actionId: "summon", label: "Summon to your library", variant: "primary" } as const;
  const spec: PluginSurfaceSpec = {
    kind: "masterDetail",
    active: "detail",
    stages: [
      { id: "browse", kind: "browse", body: { kind: "text", value: "results" } },
      { id: "detail", kind: "detail", body: { kind: "stack", children: [buried] } },
    ],
  };
  // The card-atlas shape verbatim (stickler F3): the CTA lives inside a detail stage, under a field that is
  // NOT called `children`. A walk that knew only the three container kinds would hand the primary to nobody.
  expect(resolvePluginPrimaryButton(spec, "page").granted).toBe(buried);
});

test("#818: a spec with NO primary claimant arbitrates to nothing at every anchor", () => {
  const spec: PluginSurfaceSpec = { kind: "button", actionId: "go", label: "Go", variant: "outline" };
  for (const anchor of PLUGIN_SURFACE_ANCHORS) {
    expect(resolvePluginPrimaryButton(spec, anchor)).toEqual({ granted: null, refused: [] });
  }
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

// #1803 — the guest-local tool name's length is the OTHER half of the wire-mint budget (`manifest.ts`
// PLUGIN_SLUG_MAX is the other). Judged against the constant, never a literal: at-cap accepted, one over
// refused — this is the SAME grammar the membrane's `tools.register` trust boundary enforces on raw guest
// input, so a name failing this test at that boundary is refused for LENGTH, before activation collects it.
test("PLUGIN_TOOL_NAME_RE caps the guest-local tool name at PLUGIN_TOOL_NAME_LOCAL_MAX (#1803), at-cap accepted", () => {
  const atCap = `a${"a".repeat(PLUGIN_TOOL_NAME_LOCAL_MAX - 1)}`;
  const overCap = `a${"a".repeat(PLUGIN_TOOL_NAME_LOCAL_MAX)}`;
  expect(atCap).toHaveLength(PLUGIN_TOOL_NAME_LOCAL_MAX);
  expect(PLUGIN_TOOL_NAME_RE.test(atCap)).toBe(true);
  expect(PLUGIN_TOOL_NAME_RE.test(overCap)).toBe(false);
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
  expect(schema.parse({ suit: "cups" })).toEqual({ suit: "cups" });
  expect(schema.parse({ suit: "cups", count: undefined })).toEqual({ suit: "cups" });
});

test("plugin surface readonly collection outputs preserve order without freezing guest values", () => {
  const parsed = pluginSurfaceNodeSchema.parse({
    kind: "grid",
    tiles: [{ id: "first", title: "First", tags: ["one", "two"] }],
  });
  if (parsed.kind !== "grid" || parsed.tiles === undefined) {
    throw new Error("expected a parsed grid with declared tiles");
  }
  expect(parsed.tiles.map((tile) => tile.id)).toEqual(["first"]);
  expect(parsed.tiles[0]?.tags).toEqual(["one", "two"]);
  expect(Object.isFrozen(parsed.tiles)).toBe(false);
  expect(Object.isFrozen(parsed.tiles[0]?.tags)).toBe(false);
});

/** The DECODE RULE `registrations.ts` states in its injectivity proof, implemented HERE rather than shipped.
 *  Nothing in the app decodes a wire name — the client consumes the server's `toolWireName` projection and the
 *  #1391 migration keys off the installed plugins' own slugs — so a production decoder would be an unused
 *  second home for the rule. Implementing it in the pin is what makes the header's proof falsifiable: every
 *  `_` run inside the flattened slug has EVEN length (2 per hyphen) and a tool name can never begin with `_`,
 *  so the FIRST odd-length run is the one whose LAST byte is the slug/name separator. */
function decodeWireName(wire: string): { slug: string; name: string } | null {
  const body = wire.slice(PLUGIN_TOOL_NAME_PREFIX.length);
  for (const run of body.matchAll(/_+/g)) {
    if (run[0].length % 2 === 1) {
      const separator = (run.index ?? 0) + run[0].length - 1;
      return { slug: body.slice(0, separator).replaceAll("__", "-"), name: body.slice(separator + 1) };
    }
  }
  return null;
}

test("PLUGIN_TOAST_LEVELS is the HOUSE notify vocabulary — a plugin gets no severity the app cannot render", () => {
  expect(PLUGIN_TOAST_LEVELS).toEqual(["info", "success", "warn", "error"]);
});

test("pluginToolWireName is the ONE mint: a slug's hyphens become DOUBLE underscores, and it carries the claimed prefix", () => {
  // The charset half: the OpenAI/MCP function-name grammar has no hyphen, so the slug is transliterated. A
  // second spelling of this rule anywhere would silently unmatch every registered card. `-` becomes `__`
  // (not `_`) — that is the #1391 INJECTIVITY half, pinned below.
  expect(pluginToolWireName("oracle-deck", "draw")).toBe("plugin_oracle__deck_draw");
  expect(pluginToolWireName("mood", "read")).toBe("plugin_mood_read");
  // …and the prefix the client's ONE `pluginToolRenderer` claims is the prefix this mint emits.
  expect(pluginToolWireName("oracle-deck", "draw").startsWith(PLUGIN_TOOL_NAME_PREFIX)).toBe(true);
});

test("the mint is INJECTIVE (#1391 owner ruling): the pair that used to flatten alike now mints two names", () => {
  // THE DEFECT THIS REPLACES: under `-` → `_` both halves below spelled `plugin_foo_bar_baz`, and both are
  // independently valid (`pluginSlugSchema` admits "foo-bar"; PLUGIN_TOOL_NAME_RE admits "bar_baz"), so two
  // legitimately named plugins could not coexist — the second one's install died on `ToolNameCollisionError`.
  // The owner ruled (2026-09-05) for the injective form plus a migration of the persisted spellings.
  expect(pluginSlugSchema.safeParse("foo-bar").success).toBe(true);
  expect(PLUGIN_TOOL_NAME_RE.test("bar_baz")).toBe(true);
  expect(pluginToolWireName("foo-bar", "baz")).toBe("plugin_foo__bar_baz");
  expect(pluginToolWireName("foo", "bar_baz")).toBe("plugin_foo_bar_baz");
  expect(pluginToolWireName("foo-bar", "baz")).not.toBe(pluginToolWireName("foo", "bar_baz"));
});

test("the mint is injective across the WHOLE valid grammar, and the header's decode rule recovers both halves", () => {
  // A property-style pin, not two examples: the corpus is every shape that can imitate a flattened hyphen —
  // hyphen RUNS, a TRAILING hyphen (`SLUG_RE` admits it), and names whose own `_` runs look like slug bytes.
  // Injectivity is asserted as "no two distinct pairs share an output"; the decode is the constructive proof.
  const slugs = ["foo", "foo-bar", "foo--bar", "f-o-o", "foo-", "foo--", "a1-b2", "x9"];
  const names = ["baz", "bar_baz", "b__z", "a_b_c", "q", "z_", "z__"];
  const seen = new Map<string, string>();
  for (const slug of slugs) {
    expect(pluginSlugSchema.safeParse(slug).success).toBe(true);
    for (const name of names) {
      expect(PLUGIN_TOOL_NAME_RE.test(name)).toBe(true);
      const wire = pluginToolWireName(slug, name);
      const pair = `${slug}::${name}`;
      expect(seen.get(wire) ?? pair).toBe(pair);
      seen.set(wire, pair);
      expect(decodeWireName(wire)).toEqual({ slug, name });
    }
  }
  expect(seen.size).toBe(slugs.length * names.length);
});

// ── #774 ARM C — the BOUND-collection arms (`grid.tilesFrom` + `tileAction`, `image.assetFrom`) ─────────────

test("ARM C: a grid names exactly one of `tiles` / `tilesFrom`, and `tileAction` belongs to the bound arm", () => {
  const bound: PluginSurfaceSpec = { kind: "grid", tilesFrom: { $state: "results" }, tileAction: "open", empty: "Search to begin." };
  expect(pluginSurfaceSpecSchema.safeParse(bound).success).toBe(true);
  // Declared stays valid untouched (the append-only condition, regression-pinned).
  const declared: PluginSurfaceSpec = { kind: "grid", tiles: [{ id: "a1", title: "One" }] };
  expect(pluginSurfaceSpecSchema.safeParse(declared).success).toBe(true);
  // BOTH arms is two descriptions of one grid; NEITHER is a grid with nothing to show and no binding to wait
  // for; `tileAction` beside declared tiles is a claim the renderer would never honour (declared tiles carry
  // their own per-tile actionId).
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid", tiles: [{ id: "a1", title: "One" }], tilesFrom: { $state: "results" } }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid" }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid", tiles: [{ id: "a1", title: "One" }], tileAction: "open" }).success).toBe(false);
});

test("hub v1.2: tile `tags` ride BOTH arms count-capped, and a live select declares its `actionId`", () => {
  // Declared arm: tags accepted up to the cap; one past it refused (a chip row is a scent, not a dump).
  const tags = (n: number): string[] => Array.from({ length: n }, (_unused, i) => `tag${i}`);
  const declared = (n: number): unknown => ({ kind: "grid", tiles: [{ id: "a1", title: "One", tags: tags(n) }] });
  expect(pluginSurfaceSpecSchema.safeParse(declared(PLUGIN_TILE_TAGS_MAX)).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(declared(PLUGIN_TILE_TAGS_MAX + 1)).success).toBe(false);
  // Bound arm (published state, judged at RESOLVE): same cap — an over-cap entry is DROPPED, never fatal.
  expect(pluginBoundGridTileSchema.safeParse({ id: "r0", title: "Aria", tags: tags(PLUGIN_TILE_TAGS_MAX) }).success).toBe(true);
  expect(pluginBoundGridTileSchema.safeParse({ id: "r0", title: "Aria", tags: tags(PLUGIN_TILE_TAGS_MAX + 1) }).success).toBe(false);
  // The LIVE select (the hub/sort switchers): `actionId` is legal and ident-gated, absence stays legal (U0).
  expect(
    pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "source", label: "Hub", options: [{ value: "a", label: "A" }], actionId: "search" }).success,
  ).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "source", label: "Hub", options: [{ value: "a", label: "A" }] }).success).toBe(true);
  expect(
    pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "source", label: "Hub", options: [{ value: "a", label: "A" }], actionId: "NOT AN IDENT" })
      .success,
  ).toBe(false);
});

test("ARM C: an image names exactly one of `assetId` / `assetFrom` — and the belt reaches nested subtrees", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "image", assetFrom: { $state: "detail.cover" } }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "image" }).success).toBe(false);
  // Nested through a masterDetail stage body — the belt walks `pluginChildNodes`, so a violation cannot hide
  // under a non-`children` field (the U5 blind-subtree hazard, re-pinned for the new belt).
  const nested = {
    kind: "masterDetail",
    stages: [{ id: "detail", kind: "detail", body: { kind: "image" } }],
  };
  expect(pluginSurfaceSpecSchema.safeParse(nested).success).toBe(false);
});

test("#798: a detail-stage HERO names exactly one of `assetId` / `assetFrom`, and NEITHER arm can spell a URL", () => {
  const declared = (hero: unknown): unknown => ({ kind: "masterDetail", stages: [{ id: "d", kind: "detail", hero, body: { kind: "text", value: "x" } }] });
  // The bound arm (#798 — a fetched cover whose id lives in published state) is accepted, as is a declared id.
  expect(pluginSurfaceSpecSchema.safeParse(declared({ assetFrom: { $state: "detail.cover" } })).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(declared({ assetId: "asset_01h455vb4pex5vsknk084sn02q" })).success).toBe(true);
  // BOTH arms is two descriptions of one hero; NEITHER is a hero with nothing to show — both refused by the belt.
  expect(pluginSurfaceSpecSchema.safeParse(declared({ assetId: "asset_01h455vb4pex5vsknk084sn02q", assetFrom: { $state: "c" } })).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse(declared({ alt: "no id" })).success).toBe(false);
  // THE ANTI-EXFIL-PIXEL WALL (#798 invariant): a URL is NOT spellable in a node. The declared `assetId` is a
  // TypeID, so a raw URL there fails the schema outright — a guest can never render an <img src=attacker-url>.
  expect(pluginSurfaceSpecSchema.safeParse(declared({ assetId: "https://evil.example/x.png?exfil=secret" })).success).toBe(false);
  // The bound arm carries only a $state PATH (never a URL); the resolved value is format-gated by
  // `resolvePluginBoundAssetId` (proven below) — so a URL smuggled through state paints nothing either.
});

test("#820: the BUNDLE arm is a NAME, and the exactly-one-of belt now counts THREE arms", () => {
  const image = (node: Record<string, unknown>): unknown => ({ kind: "image", ...node });
  // The third arm alone is accepted, on an `image` and on a stage hero.
  expect(pluginSurfaceSpecSchema.safeParse(image({ bundleAsset: "ui/assets/happy.png" })).success).toBe(true);
  expect(
    pluginSurfaceSpecSchema.safeParse({
      kind: "masterDetail",
      stages: [{ id: "d", kind: "detail", hero: { bundleAsset: "ui/assets/hero.webp" }, body: { kind: "text", value: "x" } }],
    }).success,
  ).toBe(true);

  // EXACTLY one: an XOR pair would have silently readmitted "all three", which is a node describing one
  // picture three ways and a renderer picking whichever arm it happens to check first.
  expect(pluginSurfaceSpecSchema.safeParse(image({ assetId: "asset_01h455vb4pex5vsknk084sn02q", bundleAsset: "ui/assets/a.png" })).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse(image({ assetFrom: { $state: "c" }, bundleAsset: "ui/assets/a.png" })).success).toBe(false);
  expect(
    pluginSurfaceSpecSchema.safeParse(image({ assetId: "asset_01h455vb4pex5vsknk084sn02q", assetFrom: { $state: "c" }, bundleAsset: "ui/assets/a.png" }))
      .success,
  ).toBe(false);

  // THE PATH IS FORMAT-WALLED with the funnel's OWN pattern, so a name the install funnel could never have
  // admitted is not spellable in a spec either — traversal, a second segment, an absolute path, a URL.
  for (const bad of [
    "ui/assets/../../etc/passwd",
    "ui/assets/../main.js",
    "ui/assets/sub/a.png",
    "/ui/assets/a.png",
    "ui/assets/.hidden.png",
    "main.js",
    "https://evil.example/x.png",
    "",
  ]) {
    expect(pluginSurfaceSpecSchema.safeParse(image({ bundleAsset: bad })).success, bad).toBe(false);
  }
});

test("#820: a declared grid tile names AT MOST one cover arm — and zero stays legal (the genre's placeholder)", () => {
  const grid = (tile: Record<string, unknown>): unknown => ({ kind: "grid", tiles: [{ id: "t1", title: "One", ...tile }] });
  expect(pluginSurfaceSpecSchema.safeParse(grid({ bundleAsset: "ui/assets/cover.png" })).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(grid({ assetId: "asset_01h455vb4pex5vsknk084sn02q" })).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(grid({})).success).toBe(true); // a coverless tile is a placeholder, not an error
  expect(pluginSurfaceSpecSchema.safeParse(grid({ assetId: "asset_01h455vb4pex5vsknk084sn02q", bundleAsset: "ui/assets/cover.png" })).success).toBe(false);
  // A BOUND tile has no bundle arm at all — a bundle path is spec structure, never published state.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "grid", tilesFrom: { $state: "results" }, tileAction: "open" }).success).toBe(true);
  expect(resolvePluginBoundTiles({ results: [{ id: "r1", title: "t", bundleAsset: "ui/assets/a.png" }] }, { $state: "results" })[0]).not.toHaveProperty(
    "bundleAsset",
  );
});

test("ARM C: resolvePluginBoundTiles validates, drops, and clamps — state is never a loophole past a registration bound", () => {
  const good = { id: "r1", title: "The Storm", subtitle: "by nobody", badge: "new" };
  const state = {
    results: [
      good,
      { id: "NOT AN IDENT", title: "dropped" }, // malformed id ⇒ dropped, not fatal
      { id: "r2", title: 42 }, // mistyped title ⇒ dropped
      { id: "r3", title: "ok", assetId: "https://evil.example/x.png" }, // a URL is not an asset id ⇒ dropped
      { id: "r4", title: "ok" },
    ],
  };
  const tiles = resolvePluginBoundTiles(state, { $state: "results" });
  expect(tiles.map((tile) => tile.id)).toEqual(["r1", "r4"]);
  // A missing path / non-array resolves to NO tiles — the grid renders its empty line, never a crash.
  expect(resolvePluginBoundTiles(state, { $state: "nope" })).toEqual([]);
  expect(resolvePluginBoundTiles({ results: "not an array" }, { $state: "results" })).toEqual([]);
  // The count clamps to the SAME cap the declared arm's schema enforces.
  const flood = { results: Array.from({ length: PLUGIN_GRID_TILES_MAX + 20 }, (_u, i) => ({ id: `r${i}`, title: "t" })) };
  expect(resolvePluginBoundTiles(flood, { $state: "results" })).toHaveLength(PLUGIN_GRID_TILES_MAX);
});

test("ARM C: resolvePluginBoundAssetId is the FORMAT wall — only a well-formed asset id ever reaches the owner resolve", () => {
  // A real TypeID format passes (ownership is the server resolve's job, judged later and owner-scoped).
  expect(resolvePluginBoundAssetId({ cover: "asset_01h455vb4pex5vsknk084sn02q" }, { $state: "cover" })).toBe("asset_01h455vb4pex5vsknk084sn02q");
  // Everything else paints nothing: a URL, a foreign-prefix id, a number, a missing path.
  expect(resolvePluginBoundAssetId({ cover: "https://evil.example/x.png" }, { $state: "cover" })).toBeUndefined();
  expect(resolvePluginBoundAssetId({ cover: "chat_01h455vb4pex5vsknk084sn02q" }, { $state: "cover" })).toBeUndefined();
  expect(resolvePluginBoundAssetId({ cover: 7 }, { $state: "cover" })).toBeUndefined();
  expect(resolvePluginBoundAssetId({}, { $state: "cover" })).toBeUndefined();
});

// ── hub v1.3 — the bound-vocabulary arms (`select.optionsFrom`, `keyValue.rowsFrom`, live `toggle`) ──────────

test("hub v1.3: a select names exactly one of `options` / `optionsFrom` — both and neither are refused", () => {
  const declared = { kind: "select", name: "sort", label: "Sort", options: [{ value: "a", label: "A" }] };
  const bound = { kind: "select", name: "sort", label: "Sort", optionsFrom: { $state: "sortOptions" } };
  expect(pluginSurfaceSpecSchema.safeParse(declared).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(bound).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...declared, optionsFrom: { $state: "sortOptions" } }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "select", name: "sort", label: "Sort" }).success).toBe(false);
});

test("hub v1.3: a keyValue names exactly one of `rows` / `rowsFrom` — both and neither are refused, and the belt reaches nested subtrees", () => {
  const declared = { kind: "keyValue", rows: [{ key: "Creator", value: "nobody" }] };
  const bound = { kind: "keyValue", rowsFrom: { $state: "detail.stats" } };
  expect(pluginSurfaceSpecSchema.safeParse(declared).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse(bound).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...declared, rowsFrom: { $state: "detail.stats" } }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "keyValue" }).success).toBe(false);
  // Nested reach: the belt walks the shared child seam, so a violating node inside a stack is still caught.
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "stack", children: [{ kind: "keyValue" }] }).success).toBe(false);
});

test("hub v1.3: a live toggle's `actionId` rides the ident grammar — arbitrary text is refused", () => {
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "toggle", name: "sfw", label: "SFW only", actionId: "search" }).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ kind: "toggle", name: "sfw", label: "SFW only", actionId: "NOT AN IDENT" }).success).toBe(false);
});

test("hub v1.3: resolvePluginBoundSelectOptions validates, drops, and clamps — the tile-resolve posture", () => {
  const state = {
    sortOptions: [
      { value: "relevance", label: "Hub default" },
      { value: 7, label: "mistyped" }, // dropped
      { bogus: true }, // dropped
      { value: "views", label: "Most viewed" },
    ],
  };
  expect(resolvePluginBoundSelectOptions(state, { $state: "sortOptions" }).map((o) => o.value)).toEqual(["relevance", "views"]);
  expect(resolvePluginBoundSelectOptions(state, { $state: "nope" })).toEqual([]);
  expect(resolvePluginBoundSelectOptions({ sortOptions: "not an array" }, { $state: "sortOptions" })).toEqual([]);
  const flood = { sortOptions: Array.from({ length: PLUGIN_ROWS_MAX + 5 }, (_u, i) => ({ value: `v${i}`, label: "L" })) };
  expect(resolvePluginBoundSelectOptions(flood, { $state: "sortOptions" })).toHaveLength(PLUGIN_ROWS_MAX);
});

test("hub v1.3: resolvePluginBoundKeyValueRows validates, drops, and clamps — plain strings on both fields", () => {
  const state = {
    detail: {
      stats: [
        { key: "Downloads", value: "7.4k" },
        { key: 5 }, // dropped
        { key: "Bound?", value: { $state: "nope" } }, // a binding inside state is NOT a string ⇒ dropped
        { key: "Favorites", value: "212" },
      ],
    },
  };
  expect(resolvePluginBoundKeyValueRows(state, { $state: "detail.stats" }).map((r) => r.key)).toEqual(["Downloads", "Favorites"]);
  expect(resolvePluginBoundKeyValueRows(state, { $state: "detail.nope" })).toEqual([]);
  const flood = { rows: Array.from({ length: PLUGIN_ROWS_MAX + 5 }, (_u, i) => ({ key: `k${i}`, value: "v" })) };
  expect(resolvePluginBoundKeyValueRows(flood, { $state: "rows" })).toHaveLength(PLUGIN_ROWS_MAX);
});

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

test("#799: resolvePluginBoundBoolean is TRUE only on a real true — a binding miss can never wedge a permanent skeleton", () => {
  expect(resolvePluginBoundBoolean({}, true)).toBe(true);
  expect(resolvePluginBoundBoolean({}, false)).toBe(false);
  expect(resolvePluginBoundBoolean({ busy: true }, { $state: "busy" })).toBe(true);
  expect(resolvePluginBoundBoolean({ busy: false }, { $state: "busy" })).toBe(false);
  // Every miss shape resolves FALSE: an absent path, a truthy non-boolean, a non-object hop.
  expect(resolvePluginBoundBoolean({}, { $state: "busy" })).toBe(false);
  expect(resolvePluginBoundBoolean({ busy: "true" }, { $state: "busy" })).toBe(false);
  expect(resolvePluginBoundBoolean({ busy: 1 }, { $state: "busy" })).toBe(false);
  expect(resolvePluginBoundBoolean({ a: 5 }, { $state: "a.b" })).toBe(false);
});
