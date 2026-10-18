// Contract tests for @orb/contracts/plugin/ui — the message-footer per-row anchor and the tool-card linkage.

import {
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_FOOTER_NODE_KIND_ALLOWED,
  PLUGIN_NODE_KINDS,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TOOL_NAME_LOCAL_MAX,
  PLUGIN_TOOL_NAME_RE,
  pluginSurfaceRegistrationMetaSchema,
} from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { PLUGIN_FOOTER_MAX_DEPTH, PLUGIN_FOOTER_MAX_NODES } from "#contracts/plugin/ui.ts";

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

// ── U3: the `tool-card` LINKAGE ('s tool-card row) ────────────────────────────────────
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
