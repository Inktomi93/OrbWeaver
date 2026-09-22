// @orb/contracts/plugin — the manifest + capability vocabulary. The Zed/WASM-component
// SHAPE borrow D46 named (copy the manifest/capability shape, NOT the runtime). `PLUGIN_CAPABILITIES` is the
// ONE closed capability axis: the manifest DECLARES a subset, the grant RECORDS the confirmed subset, and each
// member maps to a concrete host-side enforcement (coded as `CAPABILITY_HOST_FUNCTIONS` in host-v1.ts).
// The manifest is the install-time structural trust edge — every field is bounded here so a malformed bundle
// is refused before any guest code runs. A well-formed `hostVersion` is compatibility data: the lifecycle
// funnel compares it with {@link PLUGIN_HOST_VERSIONS} and raises its distinct unserved-version refusal.

import type { Branded } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import type { ProviderDef } from "../inference/provider-schema.ts";
import { isPluginProviderId, pluginNameOfProviderId, providerDefSchema } from "../inference/provider-schema.ts";

/** The closed capability axis. A manifest declares a SUBSET; a new capability is a member here + a
 *  host-function row in `CAPABILITY_HOST_FUNCTIONS` (host-v1.ts) — a capability with no function (or a
 *  function with no capability) fails `tsc` at that map. Order is the confirm-dialog display order. */
export const PLUGIN_CAPABILITIES = [
  "chat.read", // listMessages / getVariables / current()
  "chat.variables.write",
  "chat.quick_reply",
  "chat.transform", // D50 PromptTransform registration
  // The world-info READ half (#788 F12) — the benign read-symmetry of `worldinfo.write` below. It lists the
  // books ATTACHED to the invocation chat + their entries: the room's own lore, member-visible, owner-scoped by
  // construction (the bridge resolves the installer's Principal, the attachment gate is the write path's own
  // `isBookAttachedToChat`). BENIGN band (neither spend nor risk): a read of lore the room already renders, never
  // a write and never reaching a book the invocation was not admitted to. It sits BEFORE `worldinfo.write` so a
  // reader scanning "what can this do with my lorebooks" meets the read then the write — benign before risk.
  "worldinfo.read",
  "worldinfo.write",
  "global_vars", // the installing user's {{getglobalvar}} namespace
  "storage.kv", // plugin-private KV
  // The CAS asset READ (#788 seam-11 read half). A guest reads back the bytes + mime of an asset in the
  // INSTALLER's OWN CAS (e.g. an image it just generated via `imagery.generate`). Owner-scoped by construction:
  // the bridge resolves the installer's Principal and calls the assets domain's OWNER-GATED `readOwnedAssetBytes`,
  // so a guest names an id but can only ever read its own; a foreign/absent id is the leak-free `null`
  // (indistinguishable — no existence oracle). BENIGN band (neither spend nor risk): reading the installer's own
  // stored bytes touches no paid budget and leaves no sandbox, and the read is size-capped host-side.
  "assets.read",
  // The first-party RETRIEVAL read (#788 F1 residual / gap #9). A guest runs semantic document search over the
  // INSTALLER's OWN indexed corpus (the vectors-extension parity — plugins consume first-party RAG instead of
  // hand-rolling it). Owner-scoped by construction: the bridge closes the installer's `ownerId` over the search
  // scope, so a guest names only the query text and can search no other owner's library. BENIGN band (neither
  // risk nor spend): it reaches nothing outside the installer's own data, and the query embedding is LOCAL box
  // compute (the embeddings domain's own model), never a paid hosted credential — which is why it carries no
  // hourly rate floor (owner ruling: plain, not spend-classed). It sits beside `assets.read` in the "read your
  // own library" band.
  "search.query",
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
  // U8 seam — PER-CARD PLUGIN STATE (D148, the ST `writeExtensionField`/V2-card-`extensions`-object parity arm).
  // A plugin stores + reads its OWN blob under the RESERVED `data.extensions.plugin_<slug>` key on one of the
  // installer's OWN characters (`host.character.setCardData`/`getCardData`). Its OWN consent line ("store its own
  // data on your characters"): the reach is a distinct one a person weighs apart from "ingest a card" — this
  // MUTATES an EXISTING character the installer already owns, not a fresh import. BENIGN band, and even cheaper
  // than the two ingest capabilities beside it: owner-scoped by construction (the bridge stamps the slug + closes
  // the installer over the write, so no other owner and no other plugin's `plugin_<otherslug>` key is
  // expressible), it touches no paid credential, no external host, and it is METADATA not content — the write
  // never recomputes `contentHash` or re-indexes the character (D148 clause d). It sits right after the two
  // library-write capabilities because a reader scanning "what can this do to my characters" meets all three
  // together.
  "character.card_state",
  "events.subscribe",
  // U8 §5a — the PRIVATE plugin-event plane: emit + subscribe to `plugin:<slug>:<name>` events among the SAME
  // installer's plugins. BENIGN band (neither spend nor risk): it is installer-scoped, never touches a domain/
  // chat bus, never becomes a TriggerFact, and never crosses to another user (the forgery wall). It sits beside
  // `events.subscribe` because both are event reach — one over the closed domain taxonomy, one over the plugin's
  // own private vocabulary.
  "plugin_events",
  "tools.register", // D48 tool-use registry, source (b)
  "net.fetch", // requires netHosts
  // The REMOTE-IMAGE-INTO-CAS capability (plugin-remote-image #798). `host.net.fetchAsset(url)` downloads an
  // image from a manifest-allowlisted host through the SAME audited SSRF egress wall + the same hourly egress
  // belt as `net.fetch` (EGRESS DELTA ZERO — a plugin that can `net.fetch` a host can already GET its bytes),
  // runs the remote-image guard, and writes the bytes into the INSTALLER's OWN CAS, returning an assetId. It is
  // its OWN consent line rather than folded into `net.fetch` because it adds a CAS-WRITE (a durable asset in
  // your library) on top of the identical egress reach: a plugin granted `net.fetch` to call a text API must
  // not silently also mint images into your storage. Like `net.fetch` it is one of the egress capabilities and
  // so REQUIRES `netHosts` (the biconditional below). SPEND-band-adjacent by REACH (it reaches the open
  // internet) but it draws no paid credential — the CAS write is the installer's own local storage, the
  // `character.ingest` posture — so it sits beside `net.fetch` (both reach the internet, weighed together).
  "net.fetch_asset", // requires netHosts (an egress capability)
] as const;
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

/** The membrane majors this build serves. ONE contract-owned tuple feeds both install-time lifecycle
 *  compatibility and `orb.host(major)` at guest runtime, so a bundle cannot install under a major the realm
 *  then refuses (or vice versa). The manifest schema deliberately accepts any positive integer major: an
 *  unsupported but well-formed value must survive structural parsing to reach the caller-distinguishable
 *  lifecycle error. */
export const PLUGIN_HOST_VERSIONS = [1] as const;

/** The capabilities that PERFORM allowlisted egress and therefore REQUIRE `netHosts` (the SSRF wall). Both
 *  `net.fetch` (text) and `net.fetch_asset` (a remote image → the installer's CAS) reach the network through
 *  the SAME manifest allowlist and the SAME hourly egress belt; declaring EITHER requires ≥ 1 host, and a host
 *  list is meaningless without at least one of them (the biconditional's integrity is the SSRF allowlist's).
 *  Derived once so a third egress capability lands in ONE place instead of a hand-updated `||` chain. */
const EGRESS_CAPABILITIES = ["net.fetch", "net.fetch_asset"] as const satisfies readonly PluginCapability[];

/** THE MINT'S BYTE BUDGET (#1803, the #1391 fork). `pluginToolWireName` (`registrations.ts`) mints
 *  `plugin_<slug'>_<name>` where `slug'` doubles every hyphen, and the ONE registry grammar `TOOL_NAME_RE`
 *  (`packages/server/src/domain/tool-use/contract/params.ts`) refuses a name over 64 bytes. Contracts
 *  cannot import server (the cake), so the 64 here is PINNED to that regex by a cross-package test
 *  (`tests/contracts/plugin/registrations.contract.test.ts`), never a second guess at the number.
 *
 *  BEFORE THIS BUDGET EXISTED a plugin whose slug+name flattened past 64 bytes registered nothing useful:
 *  the mint ran unconditionally, activation proceeded, and only `registerPluginTool`'s downstream
 *  `TOOL_NAME_RE.test` refused the result — AFTER the guest handler was already collected, with a
 *  `ToolNameCollisionError` whose text never mentioned length. Bounding `slug` HERE (the manifest parse,
 *  this file) and the guest-local tool `name` at the membrane's `tools.register` trust boundary
 *  (`infra/plugin-host/membrane.ts`) moves the refusal to the SAME call the author made, and the two
 *  boundaries are provably sufficient: a slug ≤ {@link PLUGIN_SLUG_MAX} and a name ≤
 *  {@link PLUGIN_TOOL_NAME_LOCAL_MAX} can NEVER mint past 64 bytes (the arithmetic below is the proof),
 *  so `registerPluginTool`'s regex test is a pure backstop from here on — unreachable by construction for
 *  a plugin-sourced name, kept loud in case a future caller bypasses either boundary. */
export const PLUGIN_TOOL_WIRE_NAME_MAX = 64;
/** `PLUGIN_TOOL_NAME_PREFIX.length` (`registrations.ts`, the literal `"plugin_"`) restated as a number so
 *  the arithmetic below reads as arithmetic rather than a bare `7`. A same-package import here would reach
 *  BACK into `registrations.ts`, which itself type-imports `./ui.ts` — this file's own downstream
 *  consumer — so the tie is a literal, PINNED by the cross-package test named above rather than a second
 *  import edge. */
const PLUGIN_TOOL_WIRE_NAME_PREFIX_LEN = 7;
/** The install slug's hard cap. Every showcase plugin's slug is ≤ 17 bytes
 *  (`research-familiar`, `packages/showcase-plugins/bundles/research-familiar/manifest.json`); 20 clears
 *  every real slug with margin. It is the DOMINANT term in the budget below because the mint doubles
 *  every hyphen — one byte of slug can cost two bytes of wire name. */
export const PLUGIN_SLUG_MAX = 20;
/** The guest-local tool name's hard cap — DERIVED, not independently chosen. The mint is
 *  `prefix + slug' + "_" + name`; `slug'` doubles only the HYPHENS in `slug` (not every byte), so its
 *  worst case (a slug of `PLUGIN_SLUG_MAX` bytes that is one leading alnum char plus ALL hyphens, the
 *  maximum `SLUG_RE` admits) is `2 * PLUGIN_SLUG_MAX - 1` bytes, not `2 * PLUGIN_SLUG_MAX` — the `-1`
 *  that separator's own `+1` immediately cancels, which is why the formula below has no `-1`/`+1` of its
 *  own. Raising `PLUGIN_SLUG_MAX` automatically SHRINKS this instead of silently reopening the overrun
 *  #1803 fixes. Every showcase tool name (`advance_clock`, 13 bytes,
 *  `packages/showcase-plugins/bundles/story-clocks/main.js`) clears it with margin. Consumed by
 *  `PLUGIN_TOOL_NAME_RE` (`ui.ts`) — the SAME grammar the membrane's `tools.register` trust boundary and
 *  the `tool-card` surface's `toolName` linkage both enforce (one grammar, both boundaries). */
export const PLUGIN_TOOL_NAME_LOCAL_MAX = PLUGIN_TOOL_WIRE_NAME_MAX - PLUGIN_TOOL_WIRE_NAME_PREFIX_LEN - 2 * PLUGIN_SLUG_MAX;

/** A lowercase slug, unique per installing owner — NOT reverse-DNS (nothing federates; a slug is what users
 *  type and logs show). Also the tool namespace prefix root. Length capped at {@link PLUGIN_SLUG_MAX} (the
 *  wire-mint budget above), tighter than an arbitrary "reasonable identifier" cap would otherwise need to be. */
const SLUG_RE = new RegExp(`^[a-z0-9][a-z0-9-]{1,${PLUGIN_SLUG_MAX - 1}}$`);
export type PluginSlug = Branded<"PluginSlug">;
/** The slug as a STANDALONE input schema — the manifest field's own grammar, exported so a transport verb
 *  that takes a slug (`plugin.uninstallForAllUsers`) validates with the ONE rule rather than re-spelling a
 *  length cap that would drift from it. Same regex object, so the two can never disagree. */
export const pluginSlugSchema = z.string().regex(SLUG_RE).pipe(brandedId<PluginSlug>()) satisfies z.ZodType<PluginSlug, string>;
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
 *  name more hosts than a manifest may declare.
 *
 *  16, raised from 8 (hub v1.2, owner-directed multi-hub roster): a LEGITIMATE aggregator plugin honestly
 *  needs ~2 hosts per integrated service (API + art CDN — netHosts matching is exact, so a CDN is its own
 *  consent line), and the six-hub card-atlas already spends 10. The ceiling stays a consent-screen bound
 *  (a list a person can actually read), never a security wall — every host is still individually consented
 *  and individually SSRF-pinned. */
export const NET_HOSTS_MAX = 16;
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

/** The zip's optional BUNDLE-ASSET directory (#820, seam 11) — the ONE prefix under which a bundle may ship
 *  static IMAGE bytes (a sprite pack, decorative art) that `install`/`upgrade` extract into the INSTALLER's own
 *  CAS. It is the FOURTH admitted entry class and the only one that is a PREFIX rather than an exact name, so
 *  it is also the only place a path could ever be attacker-shaped — {@link PLUGIN_UI_ASSET_ENTRY_RE} is what
 *  keeps that from being true (see its own note). */
export const PLUGIN_UI_ASSETS_DIR = "ui/assets/";
/** The ONE spelling an admitted asset entry may have: `ui/assets/<name>`, FLAT (no second level), with `<name>`
 *  drawn from a conservative filename alphabet and starting on an alphanumeric.
 *
 *  THIS REGEX IS THE PATH-TRAVERSAL WALL, and it works by not being able to SPELL an escape rather than by
 *  filtering known-bad shapes: `..` cannot match (the first character must be alphanumeric), `/` and `\` are
 *  outside the alphabet so no second segment and no Windows separator is expressible, a leading `/` or `./`
 *  fails the anchored `ui/assets/` prefix, and a NUL/newline/space/unicode-lookalike is simply not in the
 *  class. There is nothing to normalize, because nothing that would need normalizing is admitted. */
export const PLUGIN_UI_ASSET_ENTRY_RE = /^ui\/assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** How many `ui/assets/` entries ONE bundle may ship. A sprite pack is the shape this exists for (ST's
 *  expression sets top out around 28 emotions), so 64 is generous; the cap is here because an entry COUNT is a
 *  bomb dimension the per-entry caps do not bound — 10 000 one-byte entries cost 10 000 CAS writes and 10 000
 *  junction rows at install time. */
export const PLUGIN_UI_ASSETS_MAX_COUNT = 64;
/** The DECOMPRESSED cap on ONE bundle asset. A cover/sprite that needs more than this is a plugin shipping
 *  something other than interface art. */
export const PLUGIN_UI_ASSET_MAX_BYTES = 2_097_152;
/** The DECOMPRESSED cap ACROSS every bundle asset — the aggregate the per-entry cap cannot express, and the
 *  half of the bomb guard that matters once a bundle may carry many entries: `count × per-entry` is 128 MiB,
 *  which is not a bound anyone wants a 1 MiB upload to be able to reach. Paired with the 1 MiB COMPRESSED input
 *  cap (`MAX_BUNDLE_BYTES`, the substrate's), this states the amplification ceiling directly — 8:1 — which is a
 *  stronger and simpler guard than a per-entry ratio, because a ratio computed per entry says nothing about
 *  what the entries sum to. */
export const PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES = 8_388_608;
/** Provider definitions are metadata but each becomes a deployment-global registry row + contribution write
 *  on activation. Bound the fan-out at the manifest trust edge, like capabilities and bundle assets. */
export const PLUGIN_PROVIDERS_MAX = 16;

interface ProviderManifestFields {
  readonly id: string;
  readonly capabilities: readonly PluginCapability[];
  readonly netHosts?: readonly string[] | undefined;
  readonly providers?: readonly ProviderDef[] | undefined;
}

/** The WHATWG URL global exists in every runtime that consumes contracts (Node and browsers), while this
 * package deliberately carries neither the DOM nor Node ambient library. Keep the structural surface to the
 * one parsed field the trust check needs. `providerDefSchema` has already admitted the input through `z.url()`.
 */
const WhatwgUrl = (globalThis as unknown as { readonly URL: new (input: string) => { readonly hostname: string } }).URL;

function refineFixedProviderHost(args: {
  readonly provider: ProviderDef;
  readonly index: number;
  readonly manifest: ProviderManifestFields;
  readonly ctx: z.RefinementCtx;
  readonly declaresEgress: boolean;
}): void {
  const { provider, index, manifest, ctx, declaresEgress } = args;
  if (provider.baseUrl === undefined) {
    return;
  }
  if (!declaresEgress) {
    ctx.addIssue({ code: "custom", message: "a provider with a fixed baseUrl requires an egress capability", path: ["capabilities"] });
  }
  // This is the egress enforcer's exact identity: request hosts are URL-normalized, lowercased, and have one
  // trailing root dot stripped; allowlist entries are lowercased but otherwise literal. Thus a mixed-case
  // declaration matches, while a trailing-dot netHosts entry remains the enforcer's fail-closed dud.
  const providerHost = new WhatwgUrl(provider.baseUrl).hostname.toLowerCase().replace(/\.$/u, "");
  const hostDeclared = (manifest.netHosts ?? []).some((host) => host.toLowerCase() === providerHost);
  if (!hostDeclared) {
    ctx.addIssue({
      code: "custom",
      message: `provider baseUrl host "${providerHost}" must be declared in netHosts`,
      path: ["providers", index, "baseUrl"],
    });
  }
}

/** Cross-field provider trust checks kept together: namespace identity and fixed-host egress consent are one
 * install-time decision over the fully parsed manifest, not properties `providerDefSchema` can judge alone. */
function refineManifestProviders(manifest: ProviderManifestFields, ctx: z.RefinementCtx, declaresEgress: boolean): void {
  const seenProviderIds = new Set<string>();
  for (const [index, provider] of (manifest.providers ?? []).entries()) {
    if (!isPluginProviderId(provider.id) || pluginNameOfProviderId(provider.id) !== manifest.id) {
      ctx.addIssue({
        code: "custom",
        message: `a plugin provider id must be plugin:${manifest.id}/<id>`,
        path: ["providers", index, "id"],
      });
    }
    if (seenProviderIds.has(provider.id)) {
      ctx.addIssue({ code: "custom", message: `duplicate provider id "${provider.id}"`, path: ["providers", index, "id"] });
    }
    refineFixedProviderHost({ provider, index, manifest, ctx, declaresEgress });
    seenProviderIds.add(provider.id);
  }
}

/** The bundle manifest (`manifest.json` in the zip; the FULL validated copy is persisted for provenance and
 *  re-validated on load). `netHosts` ⟺ an egress capability: declaring one requires ≥ 1 host, and a host list
 *  is meaningless without one. Every fixed provider `baseUrl` additionally names one of those exact hosts;
 *  provider dispatch leaves the guest membrane and must not mint undeclared reach. `uiEntry` ⇒ `ui.surface`
 *  is the SECOND cross-field gate (see the field). */
export const pluginManifestSchema = z
  .object({
    id: z.string().regex(SLUG_RE),
    name: z.string().min(1).max(NAME_MAX),
    version: z.string().regex(PLUGIN_SEMVER_RE),
    hostVersion: z.number().int().positive(), // structural major; lifecycle parsing checks the served tuple
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
    /** Optional provider DATA this plugin contributes while enabled. The wire stays the closed `WIRES` enum
     *  inside `providerDefSchema`; a plugin can select a shipped backend, never add one. IDs are additionally
     *  pinned to this manifest's own slug below, before bundle bytes can persist. A fixed `baseUrl` is egress
     *  outside the guest membrane, so the cross-field checks below require the same declared capability and
     *  exact-host consent as guest fetch. */
    providers: z.array(providerDefSchema).max(PLUGIN_PROVIDERS_MAX).optional(),
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
    // The netHosts ⟺ egress biconditional, generalized over EVERY egress capability (net.fetch AND
    // net.fetch_asset). Declaring an egress capability requires ≥ 1 host (an empty allowlist is a fail-closed
    // dud, not a grant); a host list without any egress capability is a dangling allowlist. ONE home so a third
    // egress capability is a single-tuple edit, never a forgotten `||` that silently un-gates a new fetch verb.
    const declaresEgress = m.capabilities.some((c) => (EGRESS_CAPABILITIES as readonly string[]).includes(c));
    const hasHosts = m.netHosts !== undefined && m.netHosts.length > 0;
    if (declaresEgress && !hasHosts) {
      ctx.addIssue({ code: "custom", message: "an egress capability (net.fetch / net.fetch_asset) requires at least one netHosts entry", path: ["netHosts"] });
    }
    if (hasHosts && !declaresEgress) {
      ctx.addIssue({ code: "custom", message: "netHosts requires an egress capability (net.fetch / net.fetch_asset)", path: ["capabilities"] });
    }
    // `uiEntry` ⇒ `ui.surface`, one direction only — and the asymmetry is deliberate, unlike the netHosts
    // biconditional above. A `ui.js` without the capability is code that could never draw anything (a scripted
    // surface is registered through `ui.register`, which the capability gates), so admitting it would put an
    // unreachable third entry through the trust edge — refuse it at the boundary. The CONVERSE is legitimate and
    // common: a plugin with `ui.surface` and no `uiEntry` is every Tier-S plugin there is.
    if (m.uiEntry !== undefined && !m.capabilities.includes("ui.surface")) {
      ctx.addIssue({ code: "custom", message: "uiEntry requires the ui.surface capability", path: ["capabilities"] });
    }
    refineManifestProviders(m, ctx, declaresEgress);
  });
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
/** One fully validated provider contribution as stored in a plugin manifest. */
export type PluginProviderContribution = ProviderDef;
