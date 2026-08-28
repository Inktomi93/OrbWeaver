// Contract tests for @orb/contracts/plugin/ui (#679 plugin-ui-plane U0, seam 3): the declarative surface-spec
// vocabulary, through U5 (seam 16). The closed axes (the six anchors incl. `page`/`dialog`; tiers; the 20 node
// kinds), the zod gate at the
// node and SPEC-root levels (the global node/depth/byte caps that a per-node schema can never see), the
// `$state` binding, and the impersonation-wall clamps that ride the vocabulary (no `primary` button, no
// unknown kind, ident-only form keys). Mirror of ui.ts.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  PLUGIN_COMMAND_DESCRIBE_MAX,
  PLUGIN_GRID_TILES_MAX,
  PLUGIN_NODE_KINDS,
  PLUGIN_ROWS_MAX,
  PLUGIN_SPEC_MAX_BYTES,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SPEC_MAX_NODES,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TOAST_LEVELS,
  PLUGIN_TOOL_NAME_PREFIX,
  PLUGIN_TOOL_NAME_RE,
  pluginCommandRegistrationMetaSchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
  pluginToolWireName,
} from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures.ts";

test("PLUGIN_SURFACE_ANCHORS carries the U5 pair — `page` (the Extensions switcher) and `dialog` (the house modal)", () => {
  expect(PLUGIN_SURFACE_ANCHORS).toEqual(["settings", "chat-flank", "chat-settings-section", "tool-card", "page", "dialog"]);
});

test("PLUGIN_SURFACE_TIERS is the two-tier axis [static, scripted]", () => {
  expect(PLUGIN_SURFACE_TIERS).toEqual(["static", "scripted"]);
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
