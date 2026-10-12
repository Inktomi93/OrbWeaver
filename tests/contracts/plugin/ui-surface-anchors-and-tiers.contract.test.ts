// Contract tests for @orb/contracts/plugin/ui — the anchor and tier axes, and the frame escape hatch.

import {
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_FRAME_CSS_MAX_CHARS,
  PLUGIN_FRAME_HTML_MAX_CHARS,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TIER_REGISTRAR,
  PLUGIN_TIER_REGISTRARS,
  pluginCommandRegistrationMetaSchema,
  pluginFrameBodySchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
} from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("a host-owned lore picker is one option source, never combined with guest options", () => {
  const node = { kind: "select", name: "book", label: "Lore book", optionsFromHost: "owned-lore-books", actionId: "configure" };
  expect(pluginSurfaceSpecSchema.safeParse(node).success).toBe(true);
  expect(pluginSurfaceSpecSchema.safeParse({ ...node, options: [{ value: "foreign", label: "Foreign" }] }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ ...node, optionsFrom: { $state: "books" } }).success).toBe(false);
  expect(pluginSurfaceSpecSchema.safeParse({ ...node, optionsFromHost: "arbitrary-catalog" }).success).toBe(false);
});

test("composer draft commands explicitly opt in at the composer action placement only", () => {
  const command = { name: "polish", describe: "Polish this draft", composerDraft: true, placements: [{ target: "composer-action", label: "Polish" }] };
  expect(pluginCommandRegistrationMetaSchema.parse(command)).toEqual(command);
  expect(pluginCommandRegistrationMetaSchema.safeParse({ ...command, placements: [{ target: "composer-media", label: "Polish" }] }).success).toBe(false);
  expect(pluginCommandRegistrationMetaSchema.safeParse({ ...command, placements: [] }).success).toBe(false);
});

test("PLUGIN_SURFACE_ANCHORS is the merged anchor set — U6's `message-footer`, then U5's `page` + `dialog`", () => {
  expect(PLUGIN_SURFACE_ANCHORS).toEqual(["settings", "chat-flank", "chat-settings-section", "tool-card", "message-footer", "page", "dialog"]);
});

test("PLUGIN_SURFACE_TIERS is the three-tier axis [static, scripted, frame] (U7 added the hatch)", () => {
  expect(PLUGIN_SURFACE_TIERS).toEqual(["static", "scripted", "frame"]);
});

// ── U7: the `ui.frame` ESCAPE HATCH (seam 13) ───────────────────────────────────────────
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
