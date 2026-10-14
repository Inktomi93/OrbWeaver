// A missing pepper may be minted only when no persisted identity or token still depends on it.
import type { SettleSessionSecretParams } from "../contract/params.ts";
import { hasSessionSecretPasswordDependents } from "../persistence/users.ts";

/** Build the pre-compose settlement without requiring an existing pepper or a constructed sessions service. */
export function createSettleSessionSecret(deps: SettleSessionSecretParams): () => Promise<string | null> {
  return async () => {
    if (deps.resolution.kind !== "absent") {
      return deps.resolution.value;
    }
    const path = deps.resolution.path;
    if ((await hasSessionSecretPasswordDependents(deps.db)) || (await deps.hasOtherDependents())) {
      throw new Error(
        `boot: SESSION_SECRET is unset and the keyfile ${path} does not exist, but this database holds local passwords, sessions or live invite links that were hashed with it. Restore ${path} from the backup taken with the database, or set SESSION_SECRET to the same value. Generating a new secret would invalidate every local password, sign-in and outstanding invite, so the boot stops here.`,
      );
    }
    return deps.createKeyfile(path);
  };
}
