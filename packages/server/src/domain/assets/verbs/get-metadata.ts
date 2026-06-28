// verb: getMetadata — the blob-serve gate (D21). Returns the `{mime,size}` of an asset the CALLER owns,
// or `undefined` (→ 404) when it doesn't exist OR isn't theirs (the two collapse — no foreign-existence
// leak). Owner-scoped off `principal.userId`; the route resolves the caller from the same-origin session
// cookie and calls this BEFORE serving bytes (a read needs no CSRF). No path is constructed here (a pure
// hash lookup), so no `isAssetHash` guard is needed — a non-hash simply matches no row.
//
// FLAG[PD-28]: the narrow roster-avatar membership exception (a chat member may fetch the avatar of a
// character in their chat — assets.md §7.1) needs the chat roster + `{ kind: 'chat', roster }` resource arm
// of `can()`, which lands with chat. Until then this is strictly owner-scoped (correct for solo/single-user).

import type { GetMetadataParams } from "../contract/params";
import type { AssetsContext, AssetsService } from "../contract/service";
import { metadataForOwnedHash } from "../persistence/queries";

export function createGetMetadata(ctx: AssetsContext): AssetsService["getMetadata"] {
  return ({ principal, hash }: GetMetadataParams) =>
    metadataForOwnedHash(ctx.db, principal.userId, hash);
}
