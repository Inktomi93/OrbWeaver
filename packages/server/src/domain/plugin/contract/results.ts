// domain/plugin/contract/results — the verb result shapes. `PluginView` projects the `plugins` row
// for the owner's management surface; `builtAgainst` is read from the persisted manifest (provenance rides
// INSIDE the manifest json — there is no denormalized column). `PluginLogView` is one line of the
// host.log ring. `SnippetResult` is the inline-mode return — TYPE HOME ONLY here; the
// `runSnippet` verb that produces it lives with the other verbs.

import type {
  PluginBuiltAgainst,
  PluginCapability,
  PluginCommandArgSpec,
  PluginLogLevel,
  PluginOrigin,
  PluginStatus,
  PluginSurfaceRegistrationMeta,
} from "@orb/contracts/plugin";
import type { AssetId, PluginId, UserId } from "@orb/kit/ids";

/** One installed plugin as its owner sees it — the `plugins` row projected, minus the bundle bytes
 *  and the full manifest json. `builtAgainst` is lifted from the persisted manifest (display/warn provenance);
 *  `null` when the manifest declared none. `grantedCapabilities` is the confirmed subset the
 *  guest feature-detects via `host.grants`. (The per-plugin spend envelope was stripped for
 *  enterprise spend enforcement.)
 *
 *  THE ASKED-VS-ALLOWED PAIR (`declaredCapabilities` + `netHosts`, both lifted from the persisted manifest).
 *  A grant surface that can show only the ALLOWED half cannot say the one sentence that makes consent
 *  meaningful — "this plugin asked for X and you allowed Y" — and cannot compute the netHosts half of an
 *  upgrade's widening delta at all (the server compares against the PRIOR manifest's `netHosts`,
 *  `verbs/upgrade.ts`, and no read surface projected it). Both are also the input the `setGrant`
 *  acknowledgement echo is built from, so the consent act pins the exact list the owner was shown. */
export interface PluginView {
  readonly id: PluginId;
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly status: PluginStatus;
  readonly origin: PluginOrigin;
  /** The URL a `url`-origin install was fetched from (plugin-ui-plane #679 U8 2b) — what the auto update-check
   *  re-fetches and what the one-click upgrade re-uses, so neither needs the owner to re-paste it. `null` for an
   *  `upload` install (the `origin ⟺ source_url` invariant: null exactly when `origin === "upload"`), which also
   *  tells a management surface whether to offer the "check for updates / update" affordance at all. */
  readonly sourceUrl: string | null;
  /** WHERE a one-click update for this row would come from — `null` when nothing can serve one (#1740). ONE
   *  question, answered once by the server, because the surface cannot answer half of it: `"url"` is derivable
   *  from `origin`, but `"showcase"` is NOT — it means "this row is a SEEDED copy of a bundle this build ships"
   *  (`@orb/showcase-plugins`), and the shipped slug set is server-side content the client must never re-spell.
   *  A hand-uploaded plugin is `null` and keeps only the manual bundle upload.
   *
   *  IT IS NOT A SECOND HOME FOR `origin`. `origin` records HOW THE BYTES ARRIVED (an immutable provenance fact
   *  the db CHECK pairs with `source_url`); this records WHO CAN SERVE THE NEXT VERSION, which for a seeded row
   *  is the app itself even though its bytes arrived as an `upload`. Collapsing them would either need a new
   *  origin member (breaking the `upload` ⟺ no-source-url invariant, and needing a backfill for every row seeded
   *  before #1740) or leave the client guessing from the slug. */
  readonly updateSource: PluginUpdateSource | null;
  readonly grantedCapabilities: readonly PluginCapability[];
  /** What the persisted manifest DECLARES (the ask). Always present — `capabilities` is a required manifest
   *  array — and possibly empty; `grantedCapabilities ⊆ this` is the standing invariant every grant write holds. */
  readonly declaredCapabilities: readonly PluginCapability[];
  /** The manifest's exact-host `net.fetch` allowlist — the REACH half of what `net.fetch` means (a capability
   *  name alone does not say where it points). `null` when the manifest declares none, which by the
   *  `netHosts ⟺ net.fetch` biconditional is exactly when `net.fetch` is not declared. */
  readonly netHosts: readonly string[] | null;
  /** THE SYSTEM'S OWN REFUSAL, made visible. `true` from the moment an UPGRADE widened declared reach and
   *  forced this row `disabled`; cleared when the owner re-consents to the WHOLE ask (`setGrant`), and
   *  `false` on a fresh install. Untouched by `setEnabled` — re-enabling grants nothing, so the gap outlives
   *  it.
   *
   *  WHY IT IS PROJECTED RATHER THAN DERIVED. Without it a forced disable renders identically to the owner's
   *  own toggle-off, and the surface then presents the system's refusal as the person's decision. It is not
   *  recoverable from current state: `declaredCapabilities ⊄ grantedCapabilities` is legitimately TRUE for an
   *  ENABLED plugin whose owner granted a paranoid subset. It records an EVENT. */
  readonly reconsentPending: boolean;
  /** WHICH of {@link netHosts} the pending re-consent added — a SUBSET of that array, by construction (the
   *  server filters it out of the same persisted manifest), so a surface marks them with an exact-string
   *  membership test and never re-implements the host fold.
   *
   *  ALWAYS EMPTY WHEN {@link reconsentPending} IS FALSE, enforced by a CHECK on the row rather than by
   *  convention. Its existence is the answer to a question that used to be unanswerable: the widening is
   *  judged against the PRIOR manifest, which the same upgrade overwrites, so the host half of the delta
   *  died at the instant it was computed and a notice could only render the whole list unmarked. That was
   *  the correct answer while nothing persisted it — a false "New" on a consent surface is worse than no
   *  mark at all — and this field is what makes the mark derivable instead of invented. */
  readonly widenedNetHosts: readonly string[];
  readonly builtAgainst: PluginBuiltAgainst | null;
  readonly lastError: string | null;
  readonly installedAt: number;
  readonly updatedAt: number;
}

/** One registered UI surface as the CALLER's client renders it (`listSurfaces` — plugin-ui-plane #679 U1): the
 *  serializable registration meta (id/anchor/title/tier/spec — the `onAction` handle stays server-side) plus the
 *  `pluginId` it belongs to (the client joins to the plugin's own name/glyph for the labeled shell). */
export interface PluginSurfaceView extends PluginSurfaceRegistrationMeta {
  readonly pluginId: PluginId;
  /** A `tool-card` surface's MODEL-VISIBLE tool name — `pluginToolWireName(row.slug, meta.toolName)`, derived
   *  HERE because the slug is the installing row's and the client has no business re-spelling the namespacing
   *  rule (plugin-ui-plane #679 U3). Present exactly when `anchor === "tool-card"` (the meta biconditional):
   *  it is what the first-party `pluginToolRenderer` matches a persisted `ToolCallRecord.name` against. */
  readonly toolWireName?: string;
}

/** A surface's published state (`getSurfaceState` — plugin-ui-plane #679 U1): the whole JSON map the renderer
 *  resolves `{ $state: "path" }` bindings against. `null` from the verb when nothing has been published yet. */
export type PluginSurfaceState = Record<string, unknown>;

/** ONE bundle-shipped image's path → CAS id (`listBundleAssets` — #820 seam 11). The renderer turns a node's
 *  `bundleAsset: "ui/assets/happy.png"` into this `assetId` and then resolves it through the SAME owner-scoped
 *  `assets.resolveBlobRefs` every declared `assetId` rides — so the bundle arm adds a NAME lookup and no new
 *  trust: an id that is not the viewer's still yields no ref and paints the placeholder.
 *
 *  The ids are safe to project precisely because the read they come from is the owner-scoped `plugins` row
 *  load: an asker who does not own the plugin gets a leak-free empty list, never someone else's map. */
export interface PluginBundleAssetView {
  /** The zip entry path, verbatim (`ui/assets/<name>`) — what a node names. */
  readonly path: string;
  readonly assetId: AssetId;
}

/** One registered COMMAND as the CALLER's client sees it (`listCommands` — plugin-ui-plane #679 U5). The
 *  registration meta (name/describe — the `onRun` handle stays server-side) plus the identity BOTH consuming
 *  surfaces need: the `pluginId` the invoke round-trip names, and the plugin's `slug` + `name`, which are the
 *  dispatch token and the menu label respectively.
 *
 *  THE SLUG IS PROJECTED, NOT DERIVED CLIENT-SIDE, for the same reason `toolWireName` is: `/plugin <slug> <name>`
 *  is the dispatch grammar, only this side knows the install's slug, and a second spelling of the rule would
 *  silently unmatch every command the day either half moved. */
export interface PluginCommandView {
  readonly pluginId: PluginId;
  /** The install slug — the FIRST token of `/plugin <slug> <name> …`. */
  readonly slug: string;
  /** The plugin's display name — the menu group label and the toast/dialog attribution the person reads. */
  readonly pluginName: string;
  readonly name: string;
  readonly describe: string;
  /** The command's DECLARED typed args (#791), projected verbatim off the registration meta — empty when the
   *  command declared none (its own opaque `args` grammar). BOTH consuming surfaces read it: the palette to build
   *  its typed input strip, the composer to parse/complete `name=value`. */
  readonly args: readonly PluginCommandArgSpec[];
}

/** One registered DISPLAY transform as the caller's client sees it (`listDisplayTransforms` — plugin-ui-plane
 *  seam 14, U6). Deliberately NOT the handler and NOT the apply: this projection exists so a viewer's client can
 *  answer ONE question — "does anything transform my rows?" — and skip every per-row round-trip when the answer
 *  is no (the byte-identity-when-off law, applied to a per-row cost). `name` is the plugin's own label for it,
 *  carried so a diagnostic surface can say WHICH transform is annotating a row. */
export interface PluginDisplayTransformView {
  readonly pluginId: PluginId;
  readonly name: string;
}

/** One published plugin as the DISTRIBUTE surface sees it (D147 clause (d)) — the `admin_distributed_plugins`
 *  row projected. It describes the deployment's POLICY, never anyone's install: no status, no grant, no
 *  crash counter, because the record is a bundle the server publishes and every actual copy is an ordinary
 *  per-owner `plugins` row with its own lifecycle. */
export interface DistributedPluginView {
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly distributedAt: number;
  readonly updatedAt: number;
}

/** Why one recipient was passed over by a fan-out. The ONE home for this axis (§5.5) — the client's admin
 *  surface renders each arm's sentence off it, so a new arm fails `tsc` at the renderer rather than
 *  degrading into an unexplained number.
 *  - `already-installed` (install fan-out): the user already holds this slug, at any version. Their row is
 *    theirs — a distribution never overwrites an install a person already made.
 *  - `version-diverged` (uninstall fan-out): the user's row is at a different version than the distributed
 *    one, so they have taken the plugin over and an admin withdrawal must not delete their choice. */
export const PLUGIN_FANOUT_SKIP_REASONS = ["already-installed", "version-diverged"] as const;
export type PluginFanoutSkipReason = (typeof PLUGIN_FANOUT_SKIP_REASONS)[number];

/** One passed-over recipient. `userHandle` rather than a bare id because the only reader is a human admin
 *  deciding whether to chase it up; the id is carried too so a surface can key rows without a second read. */
export interface PluginFanoutSkip {
  readonly userId: UserId;
  readonly userHandle: string;
  readonly reason: PluginFanoutSkipReason;
}

/** The outcome of an admin fan-out. `applied` counts the recipients the real verb ran for; `skipped` names
 *  every recipient it did NOT — reported rather than swallowed, because "one user still has this plugin" is
 *  precisely the fact an admin who just withdrew it needs, and a bare count would hide whose. */
export interface PluginFanoutResult {
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly applied: number;
  readonly skipped: readonly PluginFanoutSkip[];
}

/** What ONE user's application of the published set did (`applyDistributedPlugins`). Slugs, not views: the
 *  caller is the entry hook, whose only interest is the log line and whether anything happened — the rows
 *  themselves arrive through the ordinary `list`. `skippedSlugs` is the "already held at any version" arm,
 *  which is also the whole idempotency story (the latch is belt, this is braces). */
export interface DistributedPluginApplication {
  readonly installedSlugs: readonly string[];
  readonly skippedSlugs: readonly string[];
}

/** One line of a plugin's host.log ring — the rate-limited, ring-buffered log surface the owner reads
 *  via `getPluginLog`. `at` is the injected-clock stamp; `level` mirrors the `host.log.{info,warn,error}` arm. */
export interface PluginLogView {
  readonly level: PluginLogLevel;
  readonly message: string;
  readonly at: number;
}

/** The inline-snippet run's result — echoed into the CALLER's own chat client (a personal REPL, not a
 *  room broadcast). `error` is present iff the snippet threw / hit its wall (a snippet crash is data, never a
 *  resident-crash counter — nothing is resident to protect). `errorKind` distinguishes the two outcomes an
 *  empty `logLines` + a set `error` collapsed into one copy path before this field existed: `"parse"` means the
 *  guest source never started executing (a QuickJS `SyntaxError` caught before the first job pump — the
 *  snippet console's "It ran and logged nothing" caption is a LIE for this arm), `"runtime"` means it threw or
 *  hit the wall mid-run. `errorLine` is the guest source line the parse failed at, lifted from the QuickJS
 *  error's `stack` (`plugin-guest.js:LINE:COL`) — absent when the engine didn't report one. TYPE HOME ONLY
 *  here; `runSnippet` lives with the other verbs. */
export interface SnippetResult {
  readonly logLines: readonly string[];
  readonly error?: string;
  readonly errorKind?: "parse" | "runtime";
  readonly errorLine?: number;
}

/** The two things that can serve a NEWER bundle for an installed row (#1740) — the axis
 *  {@link PluginView.updateSource} and the client's one-click affordance both dispatch on. ONE importable home
 *  (§5.5): `"url"` = the remembered `source_url` the install rode, re-fetched through the egress guard;
 *  `"showcase"` = the copy this build SHIPS (`@orb/showcase-plugins`), which is what makes a DIVERGED seeded
 *  install updatable at all — the boot auto-upgrade deliberately passes over it, so the owner's own click is
 *  the only path left.
 *
 *  It deliberately does NOT re-spell `PLUGIN_ORIGINS`: same-looking members, different axis (origin = how the
 *  bytes arrived, this = who serves the next version), so it is its own tuple-free union rather than a subset
 *  alias of one that would drift the moment a `catalog` origin lands. */
type PluginUpdateSource = "url" | "showcase";

/** One plugin's update-check outcome. A discriminated union rather than a flat shape with an optional
 *  `newVersion`, so `newVersion` is present EXACTLY on `update-available` — a version can be neither forgotten
 *  on the arm that needs it nor invented on an arm that does not. A row with NO {@link PluginUpdateSource} — a
 *  hand-uploaded plugin nothing can serve a version for — is never in a batch result at all: there is nothing to
 *  check, which is distinct from "unreachable". `unreachable` is the URL arm's leak-free collapse; a showcase row
 *  cannot reach it (the bundle is on disk beside the server), and a slug this build no longer ships drops out of
 *  the batch as un-checkable rather than reporting a source failure that did not happen. */
export type PluginUpdateCheck =
  | { readonly pluginId: PluginId; readonly status: "up-to-date" }
  | { readonly pluginId: PluginId; readonly status: "update-available"; readonly newVersion: string }
  | { readonly pluginId: PluginId; readonly status: "unreachable" };
