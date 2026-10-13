import type { StartWorkloadOp } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
export interface ImportPostprocessDeps {
  readonly start: StartWorkloadOp;
}
export interface ImportLibraryEmitterDeps {
  readonly charactersChanged: (args: { readonly ownerId: UserId }) => void;
  readonly chatsChanged: (args: { readonly ownerId: UserId }) => void;
}
