import type { WorkloadId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { trpcErrorCode } from "#lib";

/** The server's single-active lock already holds this scope's build (`DomainConflictError` → CONFLICT). */
export function isAlreadyRunning(error: unknown): boolean {
  return trpcErrorCode(error) === "CONFLICT";
}

// A conflict is not a failure here: the offer says the build is already running instead of toasting.
export const useStartImportedChatsMemory = createEntityMutation<inferInput<Trpc["workloads"]["start"]>, { readonly id: WorkloadId }>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: (error) => (isAlreadyRunning(error) ? null : "Memory for the imported chats didn't start. Run Memory backfill under Jobs."),
});
