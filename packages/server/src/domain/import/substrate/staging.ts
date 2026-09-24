// domain/import/substrate/staging — THE STAGING NAMESPACE. Two facts about where an upload waits between
// the HTTP route that stages its bytes and the workload that consumes them, homed once because the WRITER
// (`entry/http/import.ts`, `entry/http/import-tree.ts`) and the READER (`../workload-contributions.ts`) must
// agree byte-for-byte or the import silently reads nothing.
//
// WHY A PER-OWNER SUBDIR (#1534). A staged handle is a NAME, not a capability. `workloads.start` is
// `authedProcedure` and `import-bundle`/`import-st` are singular kinds, so ANY authenticated user may post
// `{kind:"import-bundle", params:{token:"<someone else's handle>"}}`: before this split, that imported the
// other user's whole staged library into the caller's own account and then DELETED the staged file in the
// run's cleanup `finally`. Only the handle's unguessability stood between the two users, and the handle is
// not a secret — it is echoed in the uploader's own workload row (`workloads.params`, readable by every
// admin through the deployment-wide `workloads.list`/`get` arms) and, when the staging root is the OS temp
// dir, it is listable by anything else on the box.
//
// So authority is NOT a token check: the staged bytes live under the owner they were staged for, and the
// consuming run resolves handles under ITS OWN row owner's root. A handle from another user resolves to a
// path that does not exist and fails the containment belt's own `staged_path_missing` — no comparison, no
// secret, nothing to leak or replay. That is D18's "ownership is INHERITED, gated at the producer verb"
// expressed in the one namespace the filesystem gives us: the path IS the FK chain.
//
// THE OWNER SEGMENT IS VALIDATED, NOT TRUSTED. Every live `UserId` is a `newId<UserId>()` base32 TypeID, but
// this function builds a filesystem path out of an identifier, so it re-checks the charset itself rather
// than inheriting a mint it cannot see. A non-conforming id throws instead of joining — the alternative is a
// user id deciding which directory the import writes to.

import { join, resolve } from "node:path";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";

/** Where uploads stage when no root is given: the data layout's `cache/import-staging` under the default
 *  data root (`foundation/data-layout` derives the same path; a test pins the two equal). Deliberately NOT
 *  `tmpdir()`: the OS temp dir is a SHARED namespace (world-writable, world-listable on a normal box), so
 *  every other local process can watch handles appear and read the bytes of a bundle that has not been
 *  consumed yet. App-owned and cwd-relative (a prod launch runs at the repo root). */
export const DEFAULT_IMPORT_STAGING_DIR = "./data/cache/import-staging";

/** The same single-safe-segment charset the staged-handle contract enforces, applied to the owner segment. */
const OWNER_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The per-owner root under `stagingRoot` — the ONE derivation both the staging routes and the import
 * contribution call, so a handle staged for owner A is only ever resolvable by a run owned by A.
 *
 * @throws {@link DomainOperationError} `staging_owner_unsafe` when the id is not a single safe path segment.
 */
export function stagedOwnerRoot(stagingRoot: string, ownerId: UserId): string {
  if (!OWNER_SEGMENT.test(ownerId) || ownerId.includes("..")) {
    throw new DomainOperationError("staging_owner_unsafe", "staging owner id is not a safe path segment");
  }
  return join(resolve(stagingRoot), ownerId);
}
