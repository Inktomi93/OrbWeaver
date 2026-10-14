import type { ImportWindow } from "@orb/contracts/chat";
import { WORKLOAD_NOT_ADMISSIBLE } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ImportPostprocessDeps } from "../contract/post-import.ts";
import type { SettleImportMemory } from "../contract/workloads.ts";

/** The post-import memory step, the free half of the owner ruling that derived data an import makes runs on its
 *  own. It closes the import's span and enqueues the segments-only `memory-backfill` over it: the verbatim-segment
 *  embeddings, no digest, no Utility-model call. The paid digest build is never enqueued here; the client offers
 *  it over the returned span behind the model-run confirm.
 *
 *  A memory-off owner's pass is refused at admission (it would derive nothing), and the span still returns: the
 *  client decides the offer from the owner's switch. The pass ADOPTS a run already holding this span's unit.
 */
export function createSettleImportMemory(workloads: Pick<ImportPostprocessDeps, "start">, now: () => number): SettleImportMemory {
  return async ({ ownerId, from, memoryChatIds }: { readonly ownerId: UserId; readonly from: number; readonly memoryChatIds: readonly ChatId[] }) => {
    if (memoryChatIds.length === 0) {
      return null;
    }
    // A clock that stepped back mid-import must not invert the span and fail an import that finished.
    const importWindow: ImportWindow = { from, to: Math.max(from, now()) };
    // @orb-waive caught-failure-ownership(err): the one absorbed failure is the memory-off admission refusal, a
    // normal outcome whose span still returns for the client to judge; every other failure rethrows and fails the
    // import run. Ends if another refusal code is absorbed here.
    try {
      await workloads.start({
        input: { kind: "memory-backfill", params: { importWindow, segmentsOnly: true } },
        caller: null,
        funderUserId: null,
        mode: "singular",
        ownerId,
        adoptActive: true,
      });
    } catch (err) {
      // The ONE expected refusal: memory is off for this owner, so the pass has nothing to build (#156).
      if (!(err instanceof DomainOperationError && err.code === WORKLOAD_NOT_ADMISSIBLE)) {
        throw err;
      }
    }
    return importWindow;
  };
}
