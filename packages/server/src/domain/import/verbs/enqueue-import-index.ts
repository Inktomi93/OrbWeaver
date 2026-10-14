import type { UserId } from "@orb/kit/ids";
import type { ImportPostprocessDeps } from "../contract/post-import.ts";

/** The post-import index pass, shared by the zip-bundle portability descriptors AND the ST profile-directory
 *  importer — built ONCE. It embeds the owner's text corpus AFTER the import and calls no Utility model.
 *
 *  THE INDEX PASS ADOPTS: any active run of the same admission unit is idempotent and hash-gated, so it
 *  already covers the freshly imported rows, and a second enqueue would only conflict.
 */
export function createEnqueueImportIndex(workloads: Pick<ImportPostprocessDeps, "start">): (args: { readonly ownerId: UserId }) => Promise<void> {
  return async ({ ownerId }: { readonly ownerId: UserId }): Promise<void> => {
    await workloads.start({
      input: { kind: "index", params: { source: "text" } },
      caller: null,
      funderUserId: null,
      mode: "singular",
      ownerId,
      adoptActive: true,
    });
  };
}
