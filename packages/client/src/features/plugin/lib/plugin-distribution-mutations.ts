// Additional #0081 distribution doors. The Git update shares the lifecycle module's connection-freshness
// dependency because replacing a running bundle can remove or change contributed providers.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { providerDependentConnectionReads } from "./plugin-mutations.ts";

export const usePreviewPluginFromGit = createEntityMutation<inferInput<Trpc["plugin"]["previewFromGit"]>, inferOutput<Trpc["plugin"]["previewFromGit"]>>({
  options: (trpc) => trpc.plugin.previewFromGit.mutationOptions(),
  invalidates: () => [],
});

export const useInstallPluginFromGit = createEntityMutation<inferInput<Trpc["plugin"]["installFromGit"]>, inferOutput<Trpc["plugin"]["installFromGit"]>>({
  options: (trpc) => trpc.plugin.installFromGit.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.list.queryFilter()],
  errorToast: "Couldn't install that plugin from Git.",
});

export const useUpgradePluginFromStoredGit = createEntityMutation<
  inferInput<Trpc["plugin"]["upgradeFromStoredGit"]>,
  inferOutput<Trpc["plugin"]["upgradeFromStoredGit"]>
>({
  options: (trpc) => trpc.plugin.upgradeFromStoredGit.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.plugin.list.queryFilter(),
    trpc.plugin.getLog.queryFilter({ pluginId: vars.pluginId }),
    trpc.plugin.listSurfaces.queryFilter(),
    trpc.plugin.listCommands.queryFilter(),
    trpc.plugin.listBundleAssets.queryFilter(),
    ...providerDependentConnectionReads(trpc),
  ],
  errorToast: "Couldn't update that plugin from Git.",
});
