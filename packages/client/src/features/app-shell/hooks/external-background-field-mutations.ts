import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The verb WRITES no settings — it only materializes the asset and hands the entry back; the library row
 *  lands through the appearance autosave patch, which owns that reconciliation. So nothing to invalidate. */
export const useAddExternalBackground = createEntityMutation<inferInput<Trpc["settings"]["addExternalBackground"]>, BackgroundLibraryEntry>({
  options: (trpc) => trpc.settings.addExternalBackground.mutationOptions(),
  invalidates: () => [],
});
