// Canonical plugin wire outputs live in contracts; this module owns the remaining domain-only results.
import type { PluginBundleHash, PluginLogLevel, PluginManifest, PluginSurfaceRegistrationMeta } from "@orb/contracts/plugin";
import { PLUGIN_LOG_LEVELS, pluginBundleHashSchema, pluginManifestSchema, pluginSurfaceRegistrationMetaSchema } from "@orb/contracts/plugin";
import type { AssetId, PluginId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

const pluginIdSchema = typeIdSchema(ID_PREFIX.plugin);

/** A Git consent preview binds the displayed manifest to the exact cloned revision. */
export interface PluginGitPreview {
  readonly manifest: PluginManifest;
  readonly sourceCommit: string;
}

export const pluginGitPreviewSchema = z.strictObject({ manifest: pluginManifestSchema, sourceCommit: z.string() }) satisfies z.ZodType<PluginGitPreview>;

/** A URL consent preview binds the displayed manifest to the complete fetched zip. */
export interface PluginUrlPreview {
  readonly manifest: PluginManifest;
  readonly bundleHash: PluginBundleHash;
}

export const pluginUrlPreviewSchema = z.strictObject({
  manifest: pluginManifestSchema,
  bundleHash: pluginBundleHashSchema,
}) satisfies z.ZodType<PluginUrlPreview>;

/** One registered UI surface as the CALLER's client renders it (`listSurfaces` U1): the
 *  serializable registration meta (id/anchor/title/tier/spec — the `onAction` handle stays server-side) plus the
 *  `pluginId` it belongs to (the client joins to the plugin's own name/glyph for the labeled shell). */
export interface PluginSurfaceView extends PluginSurfaceRegistrationMeta {
  readonly pluginId: PluginId;
  /** A `tool-card` surface's MODEL-VISIBLE tool name — `pluginToolWireName(row.slug, meta.toolName)`, derived
   *  HERE because the slug is the installing row's and the client has no business re-spelling the namespacing
   *  rule. Present exactly when `anchor === "tool-card"` (the meta biconditional):
   *  it is what the first-party `pluginToolRenderer` matches a persisted `ToolCallRecord.name` against. */
  readonly toolWireName?: string;
}

// `safeExtend` keeps the registration meta's per-anchor refinements; `.extend` refuses a refined schema.
export const pluginSurfaceViewSchema = pluginSurfaceRegistrationMetaSchema
  .safeExtend({ pluginId: pluginIdSchema, toolWireName: z.string().exactOptional() })
  .strict() satisfies z.ZodType<PluginSurfaceView>;

/** A surface's published state (`getSurfaceState` U1): the whole JSON map the renderer
 *  resolves `{ $state: "path" }` bindings against. `null` from the verb when nothing has been published yet. */
export type PluginSurfaceState = Record<string, unknown>;

/** The map is the guest's own published JSON, open by design; only its top-level shape is checked. */
export const pluginSurfaceStateSchema = z.record(z.string(), z.unknown()) satisfies z.ZodType<PluginSurfaceState>;

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

export const pluginBundleAssetViewSchema = z.strictObject({
  path: z.string(),
  assetId: typeIdSchema(ID_PREFIX.asset),
}) satisfies z.ZodType<PluginBundleAssetView>;

/** Bytes served to an isolated frame after current ownership, consent, residency, path and MIME checks. */
export interface PluginFrameAsset {
  readonly bytes: Uint8Array;
  readonly mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

/** One registered DISPLAY transform as the caller's client sees it (`listDisplayTransforms`
 *  seam 14, U6). Deliberately NOT the handler and NOT the apply: this projection exists so a viewer's client can
 *  answer ONE question — "does anything transform my rows?" — and skip every per-row round-trip when the answer
 *  is no (the byte-identity-when-off law, applied to a per-row cost). `name` is the plugin's own label for it,
 *  carried so a diagnostic surface can say WHICH transform is annotating a row. */
export interface PluginDisplayTransformView {
  readonly pluginId: PluginId;
  readonly name: string;
}

export const pluginDisplayTransformViewSchema = z.strictObject({ pluginId: pluginIdSchema, name: z.string() }) satisfies z.ZodType<PluginDisplayTransformView>;

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

export const distributedPluginViewSchema = z.strictObject({
  slug: z.string(),
  name: z.string(),
  version: z.string(),
  distributedAt: z.number(),
  updatedAt: z.number(),
}) satisfies z.ZodType<DistributedPluginView>;

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

export const pluginFanoutResultSchema = z.strictObject({
  slug: z.string(),
  name: z.string(),
  version: z.string(),
  applied: z.int().nonnegative(),
  skipped: z.array(z.strictObject({ userId: brandedId<UserId>(), userHandle: z.string(), reason: z.enum(PLUGIN_FANOUT_SKIP_REASONS) })).readonly(),
}) satisfies z.ZodType<PluginFanoutResult>;

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

export const pluginLogViewSchema = z.strictObject({ level: z.enum(PLUGIN_LOG_LEVELS), message: z.string(), at: z.number() }) satisfies z.ZodType<PluginLogView>;

/** `uiHostCall`'s reply: the host function's result as an inert JSON string, never a materialized object. */
export interface PluginUiHostCallResult {
  readonly resultJson: string;
}

export const pluginUiHostCallResultSchema = z.strictObject({ resultJson: z.string() }) satisfies z.ZodType<PluginUiHostCallResult>;

/** `transformForDisplay`'s reply: the row text after every display transform ran (or was skipped). */
export interface PluginDisplayTransformResult {
  readonly text: string;
}

export const pluginDisplayTransformResultSchema = z.strictObject({ text: z.string() }) satisfies z.ZodType<PluginDisplayTransformResult>;

/** One plugin's update-check outcome. A discriminated union rather than a flat shape with an optional
 *  `newVersion`, so `newVersion` is present EXACTLY on `update-available` — a version can be neither forgotten
 *  on the arm that needs it nor invented on an arm that does not. A row with NO {@link PluginUpdateSource} — a
 *  hand-uploaded plugin nothing can serve a version for — is never in a batch result at all: there is nothing to
 *  check, which is distinct from "unreachable". `unreachable` is the URL arm's leak-free collapse; a showcase row
 *  cannot reach it (the bundle is on disk beside the server), and a slug this build no longer ships drops out of
 *  the batch as un-checkable rather than reporting a source failure that did not happen. */
export type PluginUpdateCheck =
  | { readonly pluginId: PluginId; readonly status: "up-to-date" }
  | {
      readonly pluginId: PluginId;
      readonly status: "update-available";
      readonly source: "url";
      readonly newVersion: string;
      readonly bundleHash: PluginBundleHash;
    }
  | { readonly pluginId: PluginId; readonly status: "update-available"; readonly source: "showcase"; readonly newVersion: string }
  | { readonly pluginId: PluginId; readonly status: "source-changed"; readonly sourceCommit: string }
  | { readonly pluginId: PluginId; readonly status: "unreachable" };

export const pluginUpdateCheckSchema = z.union([
  z.strictObject({ pluginId: pluginIdSchema, status: z.literal("up-to-date") }),
  z.strictObject({
    pluginId: pluginIdSchema,
    status: z.literal("update-available"),
    source: z.literal("url"),
    newVersion: z.string(),
    bundleHash: pluginBundleHashSchema,
  }),
  z.strictObject({ pluginId: pluginIdSchema, status: z.literal("update-available"), source: z.literal("showcase"), newVersion: z.string() }),
  z.strictObject({ pluginId: pluginIdSchema, status: z.literal("source-changed"), sourceCommit: z.string() }),
  z.strictObject({ pluginId: pluginIdSchema, status: z.literal("unreachable") }),
]) satisfies z.ZodType<PluginUpdateCheck>;
