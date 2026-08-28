// @orb/contracts/plugin — the manifest + capability vocabulary. The Zed/WASM-component
// SHAPE borrow D46 named (copy the manifest/capability shape, NOT the runtime). `PLUGIN_CAPABILITIES` is the
// ONE closed capability axis: the manifest DECLARES a subset, the grant RECORDS the confirmed subset, and each
// member maps to a concrete host-side enforcement (coded as `CAPABILITY_HOST_FUNCTIONS` in host-v1.ts).
// The manifest is the install-time trust edge — every field is bounded here so a malformed bundle is refused
// before any guest code runs (`hostVersion` refuses an unserved membrane major).

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
  "ui.surface", // draw its own house-rendered panels/controls (plugin-ui-plane #679; NOT spend, NOT admin-gated — renders only for the installer)
  // The U7 ESCAPE HATCH, and the one UI capability that is RISK class: a `frame` surface runs the plugin's OWN
  // interface code inside an isolated (opaque-origin, `default-src 'none'`, no `connect-src`) document. It reaches
  // no session, no storage, no app DOM and no sibling frame — but it CAN beacon out over WebRTC/STUN, which no CSP
  // directive Chromium recognizes can close (the measured residual R1 in `@orb/kit/card-frame`). Its consent line
  // says exactly that. It sits ADJACENT to `ui.surface` rather than in the reach band beside `net.fetch` because it
  // is the escalation OF that row — a reader deciding "what may this plugin draw" must weigh both in one place.
  "ui.frame",
  "turn.trigger", // SPEND
  "imagery.generate", // SPEND
  "llm.quiet", // SPEND — a non-canon generation on the installer's own summarize-role connection; writes NOTHING
  // The two CANON-WRITE-INTO-YOUR-OWN-LIBRARY capabilities (plugin-ui-plane #679 U8, seams 15/17). A scraper
  // plugin ingests into the INSTALLER's own databank / character library — owner-scoped by construction (the
  // bridge closes the installer over the write op; a guest can name no other owner), so past the grant the risk
  // is the installing user's own, exactly like `storage.kv`. They are NOT `net.fetch`/`llm.quiet`-class SPEND:
  // they touch no paid credential and no external host, only the box's own local write + derived-index compute,
  // which is why neither carries an hourly rate floor (the ≤32-in-flight cap + the workload system's own bounds
  // + importHash dedup are the ceiling — the same posture `storage.kv` writes take). Each gets its OWN consent
  // line: a canon write is a distinct reach a person weighs separately from "show its own panels".
  "databank.ingest", // ingest a text document into the installer's OWN databank (a Data Bank scraper)
  "character.ingest", // ingest a V2/V3 card into the installer's OWN character library (a hub-import scraper)
  "events.subscribe",
  "tools.register", // D48 tool-use registry, source (b)
  "net.fetch", // requires netHosts
] as const;
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

/** A lowercase slug, unique per installing owner — NOT reverse-DNS (nothing federates; a slug is what users
 *  type and logs show). Also the tool namespace prefix root. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
/** The slug as a STANDALONE input schema — the manifest field's own grammar, exported so a transport verb
 *  that takes a slug (`plugin.uninstallForAllUsers`) validates with the ONE rule rather than re-spelling a
 *  length cap that would drift from it. Same regex object, so the two can never disagree. */
export const pluginSlugSchema = z.string().regex(SLUG_RE);
/** The plugin's OWN semver (display + upgrade ordering) — distinct from `hostVersion` (the membrane major). */
const PLUGIN_SEMVER_RE = /^\d+\.\d+\.\d+$/;
/** An exact hostname `net.fetch` may reach (the SSRF posture; the per-request enforcer is `validateUrl`
 *  in the egress module, see below).
 *
 *  `z.hostname()` (a real RFC hostname grammar) replaced the charset regex `/^[a-z0-9.-]+$/` on 2026-08-02.
 *  The regex was a CHARSET test, not a grammar, and that was a live hole: `hostAllowed` in
 *  `server/src/infra/network/egress.ts` treats a LEADING-DOT entry as a SUFFIX WILDCARD
 *  (`if (e.startsWith(".")) host.endsWith(e)`), and the charset regex happily accepted `.com` — so a manifest
 *  could declare one entry and reach EVERY `.com` host, in direct contradiction of this field's "exact
 *  hostname" contract. It also accepted `-.-`, `...`, `example..com`, `-example.com`, and 64+ char labels.
 *  `z.hostname()` rejects all of them (probe corpus, receipts in the lane report).
 *
 *  ONE acceptance WIDENING, and it is deliberate: `z.hostname()` is case-insensitive, so `API.Example.com`
 *  now installs. That reaches no new host — the SAME `hostAllowed` lowercases every entry (`entry.toLowerCase()`)
 *  and compares it against `normalizeHost(url.hostname)` (also lowercased, trailing dot stripped), so an
 *  uppercase entry resolves to exactly the host its lowercase spelling would. Refusing the spelling at install
 *  would only reject a manifest the enforcer already normalizes. **These two sites are coupled: if
 *  `hostAllowed` ever stops normalizing case, this schema must pin lowercase again.**
 *
 *  That normalization is symmetric for CASE but not for the TRAILING DOT: `z.hostname()` also accepts the
 *  FQDN form `example.com.`, and `hostAllowed` lowercases an entry WITHOUT stripping its trailing dot while
 *  `normalizeHost` strips it from the REQUEST host — so a trailing-dot entry matches nothing and is a silent
 *  fail-closed dud (the plugin installs; its fetches are all refused). Fail-closed is the safe direction, so
 *  this is a usability wart, not a hole; if it ever needs fixing, fix it in `hostAllowed` (strip both sides),
 *  never by loosening the match.
 *
 *  IP LITERALS are NOT refused here and never were (the charset regex accepted `169.254.169.254` too) — the
 *  real enforcer is `validateUrl` in that same egress module, which blocks every IP-literal host on the
 *  non-owner-configured path (`blockEgress("ip-literal", …)`), which is the path plugin `net.fetch` takes.
 *
 *  EXPORTED because the re-grant consent act needs the SAME grammar: `plugin.setGrant` makes the caller
 *  ACKNOWLEDGE the exact host list it displayed, and validating that echo against a second, hand-rolled host
 *  rule is how the two spellings drift. One grammar, both boundaries. */
export const pluginNetHostSchema = z.hostname();
const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const AUTHOR_MAX = 120;
/** The per-manifest `netHosts` ceiling. Exported for TWO consumers, and it is deliberately ONE constant:
 *  the client says the ceiling out loud next to a host list (the P3 side-eye finding — the consent screen
 *  asserted the list was exhaustive but gave no way to check it against the declared cap), and the re-grant
 *  acknowledgement echo (`plugin.setGrant`) bounds its array by it, since an echo can never legitimately
 *  name more hosts than a manifest may declare. */
export const NET_HOSTS_MAX = 8;
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

/** The zip's METADATA entry — the manifest itself. */
export const PLUGIN_MANIFEST_ENTRY = "manifest.json";
/** The zip's SERVER-guest entry (`manifest.entry`) — one pre-bundled ES script, no module loader. */
export const PLUGIN_MAIN_ENTRY = "main.js";
/** The zip's optional CLIENT-guest entry (`manifest.uiEntry`; plugin-ui-plane #679 U4, §4.6) — the Tier-C
 *  `ui.js` that runs in the browser QuickJS worker. THREE names is the whole bundle vocabulary, and the three
 *  constants are exported so the zip allow-list, the packer and the schema all derive from ONE home rather than
 *  three "ui.js" literals that can drift apart (the allow-list IS the path-traversal wall: only exact names are
 *  ever admitted, so a name that drifts silently un-admits a real entry or admits an unintended one). */
export const PLUGIN_UI_ENTRY = "ui.js";

/** The bundle manifest (`manifest.json` in the zip; the FULL validated copy is persisted for provenance and
 *  re-validated on load). `netHosts` ⟺ `net.fetch`: declaring the capability requires ≥ 1 host, and a
 *  host list is meaningless without the capability (the biconditional is the SSRF allowlist's integrity).
 *  `uiEntry` ⇒ `ui.surface` is the SECOND biconditional half (see the field). */
export const pluginManifestSchema = z
  .object({
    id: z.string().regex(SLUG_RE),
    name: z.string().min(1).max(NAME_MAX),
    version: z.string().regex(PLUGIN_SEMVER_RE),
    hostVersion: z.literal(1), // the membrane major — refused pre-run if unserved
    entry: z.literal(PLUGIN_MAIN_ENTRY), // ONE fixed entry file in the bundle (the guest has no module loader)
    /** The OPTIONAL Tier-C client entry (plugin-ui-plane #679 U4, §4.6). Present ⇒ the bundle carries a third
     *  zip entry, `ui.js`, which runs in the BROWSER's QuickJS worker for the plugin's `tier:"scripted"`
     *  surfaces. Additive-optional by the 01 §3 host-evolution law: an existing two-entry bundle installs
     *  unchanged, and a guest feature-detects the plane through `grants`, never through this field.
     *  A fixed LITERAL, not a free path, for the same reason `entry` is: the zip allow-list admits exactly the
     *  names it knows, so path traversal is not expressible rather than merely filtered. */
    uiEntry: z.literal(PLUGIN_UI_ENTRY).optional(),
    description: z.string().max(DESCRIPTION_MAX),
    author: z.string().max(AUTHOR_MAX).optional(),
    capabilities: z.array(z.enum(PLUGIN_CAPABILITIES)).max(PLUGIN_CAPABILITIES.length),
    netHosts: z.array(pluginNetHostSchema).max(NET_HOSTS_MAX).optional(),
    /** The cascade opt-in — mirrors an automation rule's `matchAutomationEvents` column.
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
    // `uiEntry` ⇒ `ui.surface`, one direction only — and the asymmetry is deliberate, unlike the netHosts
    // biconditional above. A `ui.js` without the capability is code that could never draw anything (a scripted
    // surface is registered through `ui.register`, which the capability gates), so admitting it would put an
    // unreachable third entry through the trust edge — refuse it at the boundary. The CONVERSE is legitimate and
    // common: a plugin with `ui.surface` and no `uiEntry` is every Tier-S plugin there is.
    if (m.uiEntry !== undefined && !m.capabilities.includes("ui.surface")) {
      ctx.addIssue({ code: "custom", message: "uiEntry requires the ui.surface capability", path: ["capabilities"] });
    }
  });
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
