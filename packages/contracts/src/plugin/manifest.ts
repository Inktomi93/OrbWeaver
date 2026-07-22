// @orb/contracts/plugin — the manifest + capability vocabulary (plugin-design/02 §1). The Zed/WASM-component
// SHAPE borrow D46 named (copy the manifest/capability shape, NOT the runtime). `PLUGIN_CAPABILITIES` is the
// ONE closed capability axis: the manifest DECLARES a subset, the grant RECORDS the confirmed subset, and each
// member maps to a concrete host-side enforcement (02 §2, coded as `CAPABILITY_HOST_FUNCTIONS` in host-v1.ts).
// The manifest is the install-time trust edge — every field is bounded here so a malformed bundle is refused
// before any guest code runs (`hostVersion` refuses an unserved membrane major, 01 §3).

import { z } from "zod";

/** The closed capability axis. A manifest declares a SUBSET; a new capability is a member here + a
 *  host-function row in `CAPABILITY_HOST_FUNCTIONS` (host-v1.ts) — a capability with no function (or a
 *  function with no capability) fails `tsc` at that map. Order is the confirm-dialog display order. */
export const PLUGIN_CAPABILITIES = [
  "chat.read", // listMessages / getVariables / current()
  "chat.variables.write",
  "chat.quick_reply",
  "chat.transform", // D50 PromptTransform registration
  "worldinfo.write",
  "global_vars", // the installing user's {{getglobalvar}} namespace
  "storage.kv", // plugin-private KV
  "notify",
  "turn.trigger", // SPEND
  "imagery.generate", // SPEND
  "events.subscribe",
  "tools.register", // D48 tool-use registry, source (b)
  "net.fetch", // requires netHosts
] as const;
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

/** A lowercase slug, unique per installing owner — NOT reverse-DNS (nothing federates; a slug is what users
 *  type and logs show). Also the tool namespace prefix root (03 §5). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
/** The plugin's OWN semver (display + upgrade ordering) — distinct from `hostVersion` (the membrane major). */
const PLUGIN_SEMVER_RE = /^\d+\.\d+\.\d+$/;
/** An exact hostname `net.fetch` may reach — no wildcards, no IPs (the SSRF posture; the per-request pin is P4). */
const NET_HOST_RE = /^[a-z0-9.-]+$/;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const AUTHOR_MAX = 120;
const NET_HOSTS_MAX = 8;
const ENGINE_VERSION_MAX = 40;
const ENGINE_COMMIT_MAX = 64;

/** Build provenance — the engine the bundle was built/tested against (the Marinara `builtAgainst` shape,
 *  owner-ruled 2026-07-18). Persisted on the plugins row + surfaced in the read/list views so a mismatch
 *  against the RUNNING engine is VISIBLE (display/warn only in v1 — never a hard install gate). OPTIONAL
 *  block: a hand-authored bundle (esbuild + a text manifest) can't always produce provenance; when present,
 *  `engineVersion` is required (declared, trivially producible by any author) and `engineCommit` is
 *  best-effort (a hand-rolled sample can't emit a repo commit — only our build tooling can). */
export const pluginBuiltAgainstSchema = z
  .object({
    engineVersion: z.string().min(1).max(ENGINE_VERSION_MAX),
    engineCommit: z.string().max(ENGINE_COMMIT_MAX).optional(),
  })
  .describe("The engine version/commit the plugin was built against; display+warn provenance, not an install gate.");
export type PluginBuiltAgainst = z.infer<typeof pluginBuiltAgainstSchema>;

/** The bundle manifest (`manifest.json` in the zip; the FULL validated copy is persisted for provenance and
 *  re-validated on load — 02 §3). `netHosts` ⟺ `net.fetch`: declaring the capability requires ≥ 1 host, and a
 *  host list is meaningless without the capability (the biconditional is the SSRF allowlist's integrity). */
export const pluginManifestSchema = z
  .object({
    id: z.string().regex(SLUG_RE),
    name: z.string().min(1).max(NAME_MAX),
    version: z.string().regex(PLUGIN_SEMVER_RE),
    hostVersion: z.literal(1), // the membrane major (01 §3) — refused pre-run if unserved
    entry: z.literal("main.js"), // ONE fixed entry file in the bundle (the guest has no module loader)
    description: z.string().max(DESCRIPTION_MAX),
    author: z.string().max(AUTHOR_MAX).optional(),
    capabilities: z.array(z.enum(PLUGIN_CAPABILITIES)).max(PLUGIN_CAPABILITIES.length),
    netHosts: z.array(z.string().regex(NET_HOST_RE)).max(NET_HOSTS_MAX).optional(),
    /** The cascade opt-in (plugin-design/03 §2) — mirrors an automation rule's `matchAutomationEvents` column.
     *  `false`/absent (fail-closed default) ⇒ the plugin's `events.on` handlers receive ONLY human-plane
     *  (depth-0) facts; a depth ≥ 1 automation/plugin-caused fact is suppressed. `true` ⇒ cascade facts deliver
     *  up to the HARD depth cap (which applies regardless). ONE guard, two consumers (rules + plugins) — a
     *  loop can never be laundered through a plugin. */
    matchAutomationEvents: z.boolean().optional(),
    builtAgainst: pluginBuiltAgainstSchema.optional(),
  })
  .superRefine((m, ctx): void => {
    const declaresNet = m.capabilities.includes("net.fetch");
    const hasHosts = m.netHosts !== undefined && m.netHosts.length > 0;
    if (declaresNet && !hasHosts) {
      ctx.addIssue({ code: "custom", message: "net.fetch requires at least one netHosts entry", path: ["netHosts"] });
    }
    if (hasHosts && !declaresNet) {
      ctx.addIssue({ code: "custom", message: "netHosts requires the net.fetch capability", path: ["capabilities"] });
    }
  });
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
