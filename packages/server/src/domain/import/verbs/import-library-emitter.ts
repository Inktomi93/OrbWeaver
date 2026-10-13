import type { UserId } from "@orb/kit/ids";
import type { ImportLibraryEmitterDeps } from "../contract/post-import.ts";

export function createImportLibraryEmitter(deps: ImportLibraryEmitterDeps): (args: { readonly ownerId: UserId }) => void {
  return (args): void => {
    deps.charactersChanged(args);
    deps.chatsChanged(args);
  };
}
