// Canonical plugin wire outputs live in contracts; this module owns the remaining domain-only results.
import { providerIdSchema } from "@orb/contracts/inference";
import type { PluginBundleHash, PluginManifest, PluginReachWidening } from "@orb/contracts/plugin";
import { PLUGIN_CAPABILITIES, pluginBundleHashSchema, pluginManifestSchema, pluginNetHostSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { SNIFFED_IMAGE_MIMES } from "@orb/kit/image-sniff";
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

/** Bytes served to an isolated frame after current ownership, consent, residency, path and MIME checks. */
export interface PluginFrameAsset {
  readonly bytes: Uint8Array;
  readonly mime: (typeof SNIFFED_IMAGE_MIMES)[number];
}

/** What ONE user's application of the published set did (`applyDistributedPlugins`). Slugs, not views: the
 *  caller is the entry hook, whose only interest is the log line and whether anything happened — the rows
 *  themselves arrive through the ordinary `list`. A slug the caller already holds at any version is skipped,
 *  which is also the whole idempotency story (the latch is belt, this is braces). `refused` names each published
 *  slug whose stored bundle this build's install parse refuses (an invalid manifest or an unserved host major), with
 *  that refusal's message for the operator log. */
export interface DistributedPluginApplication {
  readonly installedSlugs: readonly string[];
  readonly refused: readonly { readonly slug: string; readonly reason: string }[];
}

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
 *  on the arm that needs it nor invented on an arm that does not. A row with no update source — a
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

// The re-consent widening type has no wire schema of its own; the preview is its only wire carrier.
const pluginReachWideningSchema = z.strictObject({
  capabilities: z.array(z.enum(PLUGIN_CAPABILITIES)).readonly(),
  netHosts: z.array(pluginNetHostSchema).readonly(),
  providerIds: z.array(providerIdSchema).readonly(),
  matchAutomationEvents: z.boolean(),
}) satisfies z.ZodType<PluginReachWidening>;

/** The identity a stored upgrade must echo so the bytes it applies are the bytes this preview showed. */
export type PluginStoredUpgradeIdentity =
  | { readonly source: "url"; readonly bundleHash: PluginBundleHash }
  | { readonly source: "git"; readonly sourceCommit: string };

/** What applying the stored source's current version would change. `widening` is the consent question; the
 *  version and the browser script are display facts beside it, and neither widens reach. */
export interface PluginStoredUpgradePreview {
  readonly pluginId: PluginId;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly shipsUiScript: { readonly before: boolean; readonly after: boolean };
  readonly widening: PluginReachWidening;
  readonly identity: PluginStoredUpgradeIdentity;
}

export const pluginStoredUpgradePreviewSchema = z.strictObject({
  pluginId: pluginIdSchema,
  fromVersion: z.string(),
  toVersion: z.string(),
  shipsUiScript: z.strictObject({ before: z.boolean(), after: z.boolean() }),
  widening: pluginReachWideningSchema,
  identity: z.discriminatedUnion("source", [
    z.strictObject({ source: z.literal("url"), bundleHash: pluginBundleHashSchema }),
    z.strictObject({ source: z.literal("git"), sourceCommit: z.string() }),
  ]),
}) satisfies z.ZodType<PluginStoredUpgradePreview>;
