// Native plugin snapshots retain their viewer and lifecycle boundary; private guest state is not a publication input.
import {
  distributedPluginViewSchema,
  PLUGIN_SURFACE_ID_RE,
  pluginBundleAssetViewSchema,
  pluginCommandViewSchema,
  pluginDisplayTransformViewSchema,
  pluginFanoutResultSchema,
  pluginLogViewSchema,
  pluginSurfaceStateSchema,
  pluginSurfaceViewSchema,
  pluginViewSchema,
} from "@orb/contracts/plugin";
import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { CorpusRead, CorpusViewerRead } from "./corpus-read.ts";

const pluginIdsSchema = z.strictObject({ pluginId: typeIdSchema(ID_PREFIX.plugin), surfaceId: z.string().regex(PLUGIN_SURFACE_ID_RE) });
const pluginStageSchema = z
  .strictObject({
    viewerUserId: brandedId<UserId>(),
    ids: pluginIdsSchema,
    reads: z.strictObject({
      plugins: pluginViewSchema.array().readonly(),
      surfaces: pluginSurfaceViewSchema.array().readonly(),
      commands: pluginCommandViewSchema.array().readonly(),
      displayTransforms: pluginDisplayTransformViewSchema.array().readonly(),
      assets: pluginBundleAssetViewSchema.array().readonly(),
      log: pluginLogViewSchema.array().readonly(),
      state: pluginSurfaceStateSchema.nullable(),
    }),
  })
  .refine(({ ids, reads }) => {
    const catalog = new Set(reads.plugins.map((plugin) => plugin.id));
    return catalog.has(ids.pluginId) && [...reads.surfaces, ...reads.commands, ...reads.displayTransforms].every((view) => catalog.has(view.pluginId));
  }, "Corpus plugin registration catalog mismatch");

interface PluginStageReads {
  readonly plugins: CorpusRead<"plugin.list">;
  readonly surfaces: CorpusRead<"plugin.listSurfaces">;
  readonly commands: CorpusRead<"plugin.listCommands">;
  readonly displayTransforms: CorpusRead<"plugin.listDisplayTransforms">;
  readonly assets: CorpusRead<"plugin.listBundleAssets">;
  readonly log: CorpusRead<"plugin.getLog">;
  readonly state: CorpusRead<"plugin.getSurfaceState">;
}

export interface CorpusPluginStage extends Omit<z.output<typeof pluginStageSchema>, "reads"> {
  readonly reads: PluginStageReads;
}

/** Only these native request spellings can round-trip through the shared publication. */
export function corpusPluginInput(ids: CorpusPluginStage["ids"]): { readonly [Key in keyof PluginStageReads]: PluginStageReads[Key]["input"] } {
  return {
    plugins: undefined,
    surfaces: undefined,
    commands: undefined,
    displayTransforms: undefined,
    assets: { pluginId: ids.pluginId },
    log: { pluginId: ids.pluginId },
    state: { pluginId: ids.pluginId, surfaceId: ids.surfaceId },
  };
}

export const pluginLibrarySchema = z
  .strictObject({
    ownerPending: pluginStageSchema,
    ownerActive: pluginStageSchema,
    recipientActive: pluginStageSchema,
    ownerDisabled: pluginStageSchema,
    ownerFinal: z.strictObject({ viewerUserId: brandedId<UserId>(), output: pluginViewSchema.array().readonly() }),
    distribution: z.strictObject({
      viewerUserId: brandedId<UserId>(),
      output: distributedPluginViewSchema.array().readonly(),
      installed: pluginFanoutResultSchema,
      repeated: pluginFanoutResultSchema,
    }),
  })
  .refine(({ ownerPending, ownerActive, recipientActive, ownerDisabled, ownerFinal, distribution }) => {
    const ownerId = ownerActive.viewerUserId;
    const pluginId = ownerActive.ids.pluginId;
    return (
      [ownerPending, ownerDisabled].every(
        (stage) => stage.viewerUserId === ownerId && stage.ids.pluginId === pluginId && stage.ids.surfaceId === ownerActive.ids.surfaceId,
      ) &&
      ownerFinal.viewerUserId === ownerId &&
      distribution.viewerUserId === ownerId &&
      recipientActive.viewerUserId !== ownerId &&
      recipientActive.ids.pluginId !== pluginId &&
      recipientActive.ids.surfaceId === ownerActive.ids.surfaceId
    );
  }, "Corpus plugin viewer or lifecycle cohort mismatch")
  .refine(({ ownerPending, ownerActive, recipientActive, ownerDisabled }) => {
    const resident = [ownerActive, recipientActive].every(
      (stage) =>
        stage.reads.plugins.some((plugin) => plugin.id === stage.ids.pluginId && plugin.status === "enabled") &&
        stage.reads.surfaces.some((surface) => surface.pluginId === stage.ids.pluginId && surface.id === stage.ids.surfaceId),
    );
    const inactive = [ownerPending, ownerDisabled].every(
      (stage) =>
        stage.reads.plugins.some((plugin) => plugin.id === stage.ids.pluginId && plugin.status === "disabled") &&
        stage.reads.surfaces.length === 0 &&
        stage.reads.commands.length === 0 &&
        stage.reads.displayTransforms.length === 0 &&
        stage.reads.log.length === 0 &&
        stage.reads.state === null,
    );
    return resident && inactive;
  }, "Corpus plugin lifecycle stage mismatch");

export interface CorpusPluginLibrary {
  readonly ownerPending: CorpusPluginStage;
  readonly ownerActive: CorpusPluginStage;
  readonly recipientActive: CorpusPluginStage;
  readonly ownerDisabled: CorpusPluginStage;
  readonly ownerFinal: CorpusViewerRead<"plugin.list">;
  readonly distribution: Omit<z.output<typeof pluginLibrarySchema>["distribution"], "output"> & { readonly read: CorpusRead<"plugin.listDistributed"> };
}

function publishStage(stage: CorpusPluginStage): z.output<typeof pluginStageSchema> {
  return pluginStageSchema.parse({
    viewerUserId: stage.viewerUserId,
    ids: stage.ids,
    reads: Object.fromEntries(Object.entries(stage.reads).map(([name, read]) => [name, read.output])),
  });
}

/** Select only public native outputs, retaining mutation outcomes without their private bundle inputs. */
export function publishCorpusPlugins(section: CorpusPluginLibrary): z.output<typeof pluginLibrarySchema> {
  return pluginLibrarySchema.parse({
    ownerPending: publishStage(section.ownerPending),
    ownerActive: publishStage(section.ownerActive),
    recipientActive: publishStage(section.recipientActive),
    ownerDisabled: publishStage(section.ownerDisabled),
    ownerFinal: { viewerUserId: section.ownerFinal.viewerUserId, output: section.ownerFinal.read.output },
    distribution: {
      viewerUserId: section.distribution.viewerUserId,
      output: section.distribution.read.output,
      installed: section.distribution.installed,
      repeated: section.distribution.repeated,
    },
  });
}

function hydrateStage(stage: z.output<typeof pluginStageSchema>): CorpusPluginStage {
  const inputs = corpusPluginInput(stage.ids);
  return {
    viewerUserId: stage.viewerUserId,
    ids: stage.ids,
    reads: {
      plugins: { input: inputs.plugins, output: stage.reads.plugins },
      surfaces: { input: inputs.surfaces, output: stage.reads.surfaces },
      commands: { input: inputs.commands, output: stage.reads.commands },
      displayTransforms: { input: inputs.displayTransforms, output: stage.reads.displayTransforms },
      assets: { input: inputs.assets, output: stage.reads.assets },
      log: { input: inputs.log, output: stage.reads.log },
      state: { input: inputs.state, output: stage.reads.state },
    },
  };
}

/** Restore only the finite captured requests; publication compares them with the actual native calls. */
export function hydrateCorpusPlugins(section: z.output<typeof pluginLibrarySchema>): CorpusPluginLibrary {
  return {
    ownerPending: hydrateStage(section.ownerPending),
    ownerActive: hydrateStage(section.ownerActive),
    recipientActive: hydrateStage(section.recipientActive),
    ownerDisabled: hydrateStage(section.ownerDisabled),
    ownerFinal: { viewerUserId: section.ownerFinal.viewerUserId, read: { input: undefined, output: section.ownerFinal.output } },
    distribution: {
      viewerUserId: section.distribution.viewerUserId,
      read: { input: undefined, output: section.distribution.output },
      installed: section.distribution.installed,
      repeated: section.distribution.repeated,
    },
  };
}
