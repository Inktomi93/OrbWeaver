// domain/rpg/verbs/edit-snapshot — editSnapshot (rpg-design/05 §4.4). The hand-edit door for the swipe-volatile
// plane: host any field; a member their own actor's volatile. Writes the CURRENT resolved snapshot in place
// (the selected variant — swipe-consistent) via the shared `applyHandEdit` helper, AUTO-LOCKING every field
// the patch touched (manual-edit-wins — a later model tool write can never overwrite it). The [merge-clear]
// contract governs the overlay (`{}` = no-op, null = leaf clear). The member arm is a coarse guard here:
// per-actor sub-field ownership (a member editing only THEIR actor's volatile) is an unfixed W1b-integration
// decision (the `actorState` keyed-lock forward-seam, substrate/merge.ts) — v1 gates the member to a
// host-only editSnapshot and defers the member-own-volatile arm with the doorway kept (it is a FORBIDDEN
// refusal, not a missing feature).

import { DomainForbiddenError } from "@orb/kit/errors";
import type { EditSnapshotParams } from "../contract/params";
import type { RpgContext, RpgService } from "../contract/service";
import { resolveMember } from "../guard";
import { applyHandEdit } from "../snapshot-edit";

export function createEditSnapshot(ctx: RpgContext): Pick<RpgService, "editSnapshot"> {
  async function editSnapshot(params: EditSnapshotParams): Promise<void> {
    const { game, role } = await resolveMember(ctx, params.principal, params.chatId);
    // The member-own-actor volatile arm is deferred (the per-actor sub-field lock grammar is unfixed — see the
    // file header); v1 gates editSnapshot host-only. The doorway is kept: a member gets a FORBIDDEN, not a lie.
    if (role !== "host") {
      throw new DomainForbiddenError("host authority required to hand-edit the snapshot");
    }
    // Auto-lock every top-level key the patch touched (the manual-edit-wins grammar; nested/keyed-array locks
    // ride the same `fieldLocks` dotted-path record the merge honors). `releaseLocks` clears the named paths
    // (the host's Release — "let the model write this again"; §12.3): the lock DELTA is `{lock, clear}`, so a
    // release-only call (empty patch) just drops the locks, and an edit-with-release does both in one commit.
    const lockPaths = Object.keys(params.patch);
    const clearPaths = params.releaseLocks ?? [];
    const snapshotId = await applyHandEdit(ctx, game, params.patch, { lock: lockPaths, clear: clearPaths });

    // The whole tracker panel re-resolves against the new resolved-current snapshot (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId });
  }
  return { editSnapshot };
}
