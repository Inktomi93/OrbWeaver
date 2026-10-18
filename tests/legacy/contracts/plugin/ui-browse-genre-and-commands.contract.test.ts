// Contract tests for @orb/contracts/plugin/ui — the browse genre and the typed command-arg grammar.

import type { PluginSurfaceSpec } from "@orb/contracts/plugin";
import {
  coercePluginCommandArgs,
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_COMMAND_ARG_TYPES,
  PLUGIN_COMMAND_ARGS_DECLARED_MAX,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TEXT_MAX_CHARS,
  pluginCommandArgSpecSchema,
  pluginCommandArgsSchema,
  pluginCommandRegistrationMetaSchema,
  pluginComposerDraftSchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
  resolvePluginBoundBoolean,
} from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import {
  PLUGIN_COMMAND_DESCRIBE_MAX,
  PLUGIN_COMMAND_PLACEMENT_LABEL_MAX,
  PLUGIN_GRID_TILES_MAX,
  PLUGIN_SPEC_MAX_NODES,
  pluginSurfaceNodeSchema,
} from "#contracts/plugin/ui.ts";

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

test("a command arg's `default` must match its type, and an enum default must be one of its values", () => {
  expect(pluginCommandArgSpecSchema.safeParse({ name: "style", type: "enum", enumValues: ["ink", "oil"], default: "oil" }).success).toBe(true);
  expect(pluginCommandArgSpecSchema.safeParse({ name: "style", type: "enum", enumValues: ["ink", "oil"], default: "chalk" }).success).toBe(false);
  expect(pluginCommandArgSpecSchema.safeParse({ name: "n", type: "number", default: 3 }).success).toBe(true);
  expect(pluginCommandArgSpecSchema.safeParse({ name: "n", type: "number", default: "3" }).success).toBe(false);
  expect(pluginCommandArgSpecSchema.safeParse({ name: "loud", type: "boolean", default: true }).success).toBe(true);
  expect(pluginCommandArgSpecSchema.safeParse({ name: "note", type: "string", default: 1 }).success).toBe(false);
  expect(pluginCommandArgSpecSchema.parse({ name: "n", type: "number", default: 3 })).toMatchObject({ default: 3 });
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

test("#0237: command placements accept only the closed unique composer targets", () => {
  const base = { name: "draw", describe: "Draw a card" };
  expect(
    pluginCommandRegistrationMetaSchema.safeParse({
      ...base,
      group: "Cards",
      placements: [
        { target: "composer-action", label: "Draw", icon: "star" },
        { target: "composer-media", label: "Illustrate" },
      ],
    }).success,
  ).toBe(true);
  expect(pluginCommandRegistrationMetaSchema.safeParse({ ...base, placements: [{ target: "topbar", label: "Draw" }] }).success).toBe(false);
  expect(
    pluginCommandRegistrationMetaSchema.safeParse({
      ...base,
      placements: [
        { target: "composer-action", label: "Draw" },
        { target: "composer-action", label: "Again" },
      ],
    }).success,
  ).toBe(false);
});

test("#0237: a placement label is bounded at PLUGIN_COMMAND_PLACEMENT_LABEL_MAX, inclusive", () => {
  const withLabel = (label: string): unknown => ({ name: "draw", describe: "Draw a card", placements: [{ target: "composer-action", label }] });
  expect(pluginCommandRegistrationMetaSchema.safeParse(withLabel("a".repeat(PLUGIN_COMMAND_PLACEMENT_LABEL_MAX))).success).toBe(true);
  expect(pluginCommandRegistrationMetaSchema.safeParse(withLabel("a".repeat(PLUGIN_COMMAND_PLACEMENT_LABEL_MAX + 1))).success).toBe(false);
});

// The whole anchor-by-tier admission matrix, pinned by value. The narrower tests above each guard one column
// or row; this one makes any cell change a deliberate edit here, and checks the registration gate honours
// every cell rather than only the table's own shape.
const ADMITTED_ANCHOR_TIERS = {
  settings: { static: true, scripted: true, frame: true },
  "chat-flank": { static: true, scripted: true, frame: true },
  "chat-settings-section": { static: true, scripted: true, frame: false },
  "tool-card": { static: true, scripted: true, frame: true },
  "message-footer": { static: true, scripted: false, frame: false },
  page: { static: true, scripted: true, frame: true },
  dialog: { static: true, scripted: true, frame: true },
} as const;

test("#0234: PLUGIN_ANCHOR_TIERS is the admitted matrix, and the registration gate admits exactly its cells", () => {
  expect(PLUGIN_ANCHOR_TIERS).toEqual(ADMITTED_ANCHOR_TIERS);
  for (const anchor of PLUGIN_SURFACE_ANCHORS) {
    for (const tier of PLUGIN_SURFACE_TIERS) {
      const meta = {
        id: "surface",
        anchor,
        title: "Surface",
        tier,
        ...(tier === "static" ? { spec: { kind: "badge", text: "seen" } } : {}),
        ...(anchor === "tool-card" ? { toolName: "draw" } : {}),
      };
      expect(pluginSurfaceRegistrationMetaSchema.safeParse(meta).success, `${anchor} × ${tier}`).toBe(ADMITTED_ANCHOR_TIERS[anchor][tier]);
    }
  }
});

test("composer text retains the canonical inclusive character bound and rejects malformed Unicode", () => {
  expect(PLUGIN_TEXT_MAX_CHARS).toBe(32_000);
  const atLimit = "x".repeat(PLUGIN_TEXT_MAX_CHARS);
  expect(pluginComposerDraftSchema.parse(atLimit)).toBe(atLimit);
  expect(pluginComposerDraftSchema.safeParse(`${atLimit}x`).success).toBe(false);
  expect(pluginComposerDraftSchema.safeParse("\ud800").success).toBe(false);
});
