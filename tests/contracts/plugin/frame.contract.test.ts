// Contract tests for @orb/contracts/plugin/frame (#679 U7, seam 13): the plugin-frame DOORWAY's mint wire and
// the postMessage BRIDGE's payload parser. Both are boundaries crossed by an untrusted document, so both are
// tested as refusals first and acceptances second.
//
// What is NOT here, deliberately: the SENDER check. Window identity needs the embedder's iframe ref, which is
// DOM, so it lives in `plugin-frame.tsx` and is pinned by its CT. Neither half is sufficient alone — a payload
// that parses from the wrong window is still an attack — and splitting the pins the same way the code splits
// keeps that honest rather than letting one file's green read as the whole boundary.

import type { PluginFrameCall } from "@orb/contracts/plugin";
import {
  PLUGIN_FRAME_DOC_PREFIX,
  PLUGIN_FRAME_RESULT_KEY,
  PLUGIN_FRAME_ROUTE,
  parsePluginFrameCall,
  pluginFrameAssetUrl,
  pluginFrameMintRequestSchema,
  pluginFrameResultMessage,
  pluginFrameUrl,
} from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures.ts";

const PLUGIN = "plugin_01h455vb4pex5vsknk084sn02q";

test("the mint request is a SELECTOR — it carries no document bytes and no policy, and strictObject refuses both", () => {
  const ok = pluginFrameMintRequestSchema.safeParse({ pluginId: PLUGIN, surfaceId: "board" });
  expect(ok.success).toBe(true);

  // THE CENTRAL CLAIM OF THIS DOORWAY: unlike the card mint, a client cannot supply the document. If `html`
  // ever became acceptable here, any authenticated caller could mint an arbitrary document at this origin and
  // have it served under `script-src 'unsafe-inline'` inside a sandbox — which is a self-XSS with a CSP that
  // permits scripts. `strictObject` is what makes this a REJECT rather than a silent strip.
  expect(pluginFrameMintRequestSchema.safeParse({ pluginId: PLUGIN, surfaceId: "board", html: "<script>x()</script>" }).success).toBe(false);
  // …and no policy/posture field is nameable either.
  expect(pluginFrameMintRequestSchema.safeParse({ pluginId: PLUGIN, surfaceId: "board", allowExternalMedia: true }).success).toBe(false);
  expect(pluginFrameMintRequestSchema.safeParse({ pluginId: PLUGIN, surfaceId: "board", posture: "interactive" }).success).toBe(false);
  expect(pluginFrameMintRequestSchema.safeParse({ pluginId: PLUGIN, surfaceId: "board", csp: "default-src *" }).success).toBe(false);
});

test("the mint request accepts the theme block and bounds it — the one thing a client legitimately supplies", () => {
  const themed = pluginFrameMintRequestSchema.safeParse({
    pluginId: PLUGIN,
    surfaceId: "board",
    themeTokens: { "--sandbox-bg": "oklch(0.2 0 0)" },
    fontFamily: "Inter, sans-serif",
  });
  expect(themed.success).toBe(true);
  // The VALUES are re-clamped server-side by `clampCardFrameThemeTokens`/`clampCardFrameFontFamily`; these caps
  // only bound the parse, so an over-long font list is refused at the wire before it reaches the clamp.
  expect(pluginFrameMintRequestSchema.safeParse({ pluginId: PLUGIN, surfaceId: "board", fontFamily: "x".repeat(200) }).success).toBe(false);
  const tooMany = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`--t${i}`, "#000"]));
  expect(pluginFrameMintRequestSchema.safeParse({ pluginId: PLUGIN, surfaceId: "board", themeTokens: tooMany }).success).toBe(false);
});

test("the document prefix is DERIVED from the route — the app-CSP exemption cannot drift from the path it exempts", () => {
  // `security-headers.ts` steps aside for this prefix so the frame's own response policy survives. A re-typed
  // copy there would not fail loudly: it would silently serve the document under the APP policy (`script-src
  // 'self'`, no `sandbox` directive), i.e. an isolated frame that is not isolated.
  expect(PLUGIN_FRAME_DOC_PREFIX).toBe(`${PLUGIN_FRAME_ROUTE}/`);
  expect(pluginFrameUrl("0123456789abcdef0123456789abcdef").startsWith(PLUGIN_FRAME_DOC_PREFIX)).toBe(true);
});

test("the frame asset URL carries only the handle and encoded bundle path", () => {
  expect(pluginFrameAssetUrl("0123456789abcdef0123456789abcdef", "ui/assets/piece one.png")).toBe(
    "/api/plugin-frame/0123456789abcdef0123456789abcdef/asset?path=ui%2Fassets%2Fpiece%20one.png",
  );
});

// ── The BRIDGE parser (the payload half of the postMessage boundary) ─────────────────────────────────────────

test("a well-formed namespaced call parses, and its args cross as opaque data", () => {
  const parsed = parsePluginFrameCall({ orbPluginFrameCall: { callId: "c1", fn: "chat.listMessages", args: { limit: 5 } } });
  expect(parsed).toEqual<PluginFrameCall>({ callId: "c1", fn: "chat.listMessages", args: { limit: 5 } });
});

test("everything that is not a namespaced call parses to undefined — including the height report on the same window", () => {
  // The height channel rides the SAME window as the bridge. If it parsed as a call, every frame resize would
  // relay a garbage host call.
  expect(parsePluginFrameCall({ orbCardFrameHeight: 480 })).toBeUndefined();
  // A bare, un-namespaced call shape is NOT a call: the namespace is what stops another listener's traffic (or
  // an attacker's guess at a generic envelope) from being read as one.
  expect(parsePluginFrameCall({ callId: "c1", fn: "chat.listMessages", args: {} })).toBeUndefined();
  // Structural junk of every flavour a hostile document can post.
  for (const junk of [undefined, null, 0, "orbPluginFrameCall", [], { orbPluginFrameCall: null }, { orbPluginFrameCall: "x" }, { orbPluginFrameCall: [] }]) {
    expect(parsePluginFrameCall(junk)).toBeUndefined();
  }
});

test("the parser bounds the fields a hostile frame controls — an unbounded fn or callId never reaches the relay", () => {
  const call = (over: Record<string, unknown>): unknown => ({ orbPluginFrameCall: { callId: "c1", fn: "chat.read", args: null, ...over } });
  expect(parsePluginFrameCall(call({}))).toBeDefined();
  // `callId` is ECHOED BACK into the document, so an unbounded one is a needless amplification.
  expect(parsePluginFrameCall(call({ callId: "x".repeat(65) }))).toBeUndefined();
  expect(parsePluginFrameCall(call({ callId: "" }))).toBeUndefined();
  // `fn` is bounded here and RE-GATED server-side against `UI_PROXYABLE ∩ grants`; this cap is a wire bound and
  // never the authorization, which is why a plausible-but-ungranted name still parses (and is refused later).
  expect(parsePluginFrameCall(call({ fn: "x".repeat(65) }))).toBeUndefined();
  expect(parsePluginFrameCall(call({ fn: "" }))).toBeUndefined();
  expect(parsePluginFrameCall(call({ fn: "credentials.readAll" }))).toBeDefined();
  // A non-string in either slot is not a call.
  expect(parsePluginFrameCall(call({ fn: 42 }))).toBeUndefined();
  expect(parsePluginFrameCall(call({ callId: { toString: "no" } }))).toBeUndefined();
});

test("a refusal reply carries no reason — the frame learns its call failed and nothing about why", () => {
  const refused = pluginFrameResultMessage({ callId: "c1", ok: false, error: "refused" });
  expect(refused).toEqual({ [PLUGIN_FRAME_RESULT_KEY]: { callId: "c1", ok: false, error: "refused" } });
  // The one-word refusal is the whole vocabulary: "you lack that grant" vs "no such function" vs "the relay is
  // not wired" would be an oracle a hostile document gets for free. If a richer error ever lands here, that is
  // the property being given up.
  const ok = pluginFrameResultMessage({ callId: "c1", ok: true, value: { rows: 2 } });
  expect(ok).toEqual({ [PLUGIN_FRAME_RESULT_KEY]: { callId: "c1", ok: true, value: { rows: 2 } } });
});
