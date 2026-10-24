// The reads the Settings groups issue when they open on a fresh server, keyed by the exact request each one sends.
// A populated graph settles taller than the box a first boot reserves, so these come from a server nothing was seeded into.
import { credentialViewSchema } from "@orb/contracts/credentials";
import { adminUserViewSchema, shareStatusSchema, signInModeViewSchema, viewerViewSchema } from "@orb/contracts/identity";
import { bindingViewSchema, connectionViewSchema, providerAvailabilitySchema } from "@orb/contracts/inference";
import { presetSummarySchema } from "@orb/contracts/preset";
import { searchSpaceStatusSchema } from "@orb/contracts/search";
import { appSettingsViewSchema, themeViewSchema, userSettingsViewSchema } from "@orb/contracts/settings";
import { EMBEDDER_REBUILD_KINDS, workloadRowAnyKindSchema, workloadScheduleViewSchema } from "@orb/contracts/workloads";
import { z } from "zod";
import type { CorpusRead } from "./corpus-read.ts";

export const firstBootSchema = z
  .strictObject({
    reads: z.strictObject({
      viewer: viewerViewSchema,
      settings: userSettingsViewSchema,
      themes: themeViewSchema.array(),
      appSettings: appSettingsViewSchema,
      connections: connectionViewSchema.array(),
      bindings: bindingViewSchema.array(),
      providers: providerAvailabilitySchema.array(),
      credentials: credentialViewSchema.array(),
      users: adminUserViewSchema.array(),
      schedules: workloadScheduleViewSchema.array(),
      signInMode: signInModeViewSchema,
      shareStatus: shareStatusSchema,
      presets: presetSummarySchema.array(),
      spaceStatus: searchSpaceStatusSchema,
    }),
    // The unfiltered history first, then one page per embedder rebuild kind, in `firstBootInput.workloadLists` order.
    workloadLists: workloadRowAnyKindSchema.array().array(),
  })
  .refine(({ workloadLists }) => workloadLists.length === EMBEDDER_REBUILD_KINDS.length + 1, "Corpus first-boot workload lists do not match the requests");

export interface CorpusFirstBoot extends Omit<z.output<typeof firstBootSchema>, "reads" | "workloadLists"> {
  readonly reads: {
    readonly viewer: CorpusRead<"sessions.me">;
    readonly settings: CorpusRead<"settings.getUserSettings">;
    readonly themes: CorpusRead<"settings.listThemes">;
    readonly appSettings: CorpusRead<"settings.getAppSettingsWithOverrides">;
    readonly connections: CorpusRead<"connection.list">;
    readonly bindings: CorpusRead<"connection.listBindings">;
    readonly providers: CorpusRead<"connection.providersAvailable">;
    readonly credentials: CorpusRead<"credentials.list">;
    readonly users: CorpusRead<"admin.listUsers">;
    readonly schedules: CorpusRead<"workloads.listSchedules">;
    readonly signInMode: CorpusRead<"share.signInMode">;
    readonly shareStatus: CorpusRead<"share.status">;
    readonly presets: CorpusRead<"preset.list">;
    readonly spaceStatus: CorpusRead<"search.spaceStatus">;
  };
  readonly workloadLists: readonly CorpusRead<"workloads.list">[];
}

/** The exact requests the Settings groups send: the Jobs list and schedules ask for everything, each role row asks per rebuild kind. */
export const firstBootInput = {
  bindings: (): CorpusRead<"connection.listBindings">["input"] => undefined,
  schedules: (): CorpusRead<"workloads.listSchedules">["input"] => ({}),
  workloadLists: (): readonly CorpusRead<"workloads.list">["input"][] => [{}, ...EMBEDDER_REBUILD_KINDS.map((kind) => ({ kind }))],
};

/** Publish canonical outputs without replacing the original captured requests. */
export function publishFirstBoot(section: CorpusFirstBoot): z.output<typeof firstBootSchema> {
  return firstBootSchema.parse({
    reads: Object.fromEntries(Object.entries(section.reads).map(([name, read]) => [name, read.output])),
    workloadLists: section.workloadLists.map((read) => read.output),
  });
}

/** Reconstruct only the finite Settings requests; changed requests refuse in the corpus serializer. */
export function hydrateFirstBoot(section: z.output<typeof firstBootSchema>): CorpusFirstBoot {
  const { reads } = section;
  const inputs = firstBootInput.workloadLists();
  return {
    reads: {
      viewer: { input: undefined, output: reads.viewer },
      settings: { input: undefined, output: reads.settings },
      themes: { input: undefined, output: reads.themes },
      appSettings: { input: undefined, output: reads.appSettings },
      connections: { input: undefined, output: reads.connections },
      bindings: { input: firstBootInput.bindings(), output: reads.bindings },
      providers: { input: undefined, output: reads.providers },
      credentials: { input: undefined, output: reads.credentials },
      users: { input: undefined, output: reads.users },
      schedules: { input: firstBootInput.schedules(), output: reads.schedules },
      signInMode: { input: undefined, output: reads.signInMode },
      shareStatus: { input: undefined, output: reads.shareStatus },
      presets: { input: undefined, output: reads.presets },
      spaceStatus: { input: undefined, output: reads.spaceStatus },
    },
    workloadLists: section.workloadLists.map((output, index) => ({ input: inputs[index], output })),
  };
}
