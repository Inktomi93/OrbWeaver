// Canonical plugin wire outputs live in contracts; this module owns the remaining domain-only results.
import type { PluginBundleHash, PluginManifest } from "@orb/contracts/plugin";
import { pluginBundleHashSchema, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
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
  readonly mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

/** What ONE user's application of the published set did (`applyDistributedPlugins`). Slugs, not views: the
 *  caller is the entry hook, whose only interest is the log line and whether anything happened — the rows
 *  themselves arrive through the ordinary `list`. `skippedSlugs` is the "already held at any version" arm,
 *  which is also the whole idempotency story (the latch is belt, this is braces). */
export interface DistributedPluginApplication {
  readonly installedSlugs: readonly string[];
  readonly skippedSlugs: readonly string[];
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
