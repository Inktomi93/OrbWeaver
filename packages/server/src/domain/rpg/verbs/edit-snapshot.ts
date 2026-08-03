// domain/rpg/verbs/edit-snapshot — editSnapshot (rpg-design/05 §4.4). The hand-edit door for the swipe-volatile
// plane: host any field; a member their own actor's volatile. Writes the CURRENT resolved snapshot in place
// (the selected variant — swipe-consistent) via the shared `applyHandEdit` helper, AUTO-LOCKING every field
// the patch touched (manual-edit-wins — a later model tool write can never overwrite it). The [merge-clear]
// contract governs the overlay (`{}` = no-op, null = leaf clear). The member arm is a coarse guard here:
// per-actor sub-field ownership (a member editing only THEIR actor's volatile) is an unfixed W1b-integration
// decision (the `actorState` keyed-lock forward-seam, substrate/merge.ts) — v1 gates the member to a
// host-only editSnapshot and defers the member-own-volatile arm with the doorway kept (it is a FORBIDDEN
// refusal, not a missing feature).
//
// THE `actorState` IMAGE LEFT THIS DOOR (R1, the actor-state review §5). The per-actor volatile plane is
// op-shaped now — `rpg.patchActor` writes one field on one actor against the true head, `rpg.dismissActor`
// removes an actor — because an image over a plane the client only sees in PROJECTIONS was the factory that
// produced three shipped defects plus the latent stale-image clobber. A patch naming it comes back as a
// refusal that says which verb owns it (`RPG_OP_SHAPED_PLANES`); everything image-honest (the ambient leaves,
// the `trackerValues` record, `plot`, `recentEvents`, `presentCharacters`, `quests`) is unchanged here.
//
// THIS VERB OWNS THE PER-PATH LEGALITY (`contracts/rpg/inputs.ts` — the `patch` is an opaque record at the
// wire, "a bad path is errors-as-data, never a wire reject"), and it owns it in TWO gates:
//   1. PLANE legality, here — every top-level patch key must be a hand-patchable snapshot-state plane
//      (`RPG_HAND_PATCH_PLANES`, derived from the state schema itself). Without this gate a foreign key
//      merged into the state object and then vanished at the column projection: `{ambient: null}` (the
//      TRACKER VIEW's grouping of location/date/clock/weather, which has no state home) wrote nothing, said
//      nothing, stamped a junk `ambient` lock, and — on a committed head — clone-forwarded a redundant
//      snapshot identical to the one before it (pre-D124 that also minted a blank canon row to key it).
//   2. VALUE legality, in `applyHandEdit` — the F1 write-boundary parse of the MERGED state (D108: "canon
//      never corrupted" is structural). A clear is only honest where the contract says the leaf is nullable:
//      `clock`/`calendarDate`/`weather`/`plot` clear to null; `location` and the arrays/records do not (their
//      empty value is `""`/`[]`/`{}`), and a `null` at one of those is REFUSED, not coerced.
// Both refuse as DATA (`HandDoorResult`), so the caller learns which path and why instead of reading a
// `{}` that means "I did nothing and I'm not telling you".

import { RPG_HAND_PATCH_PLANES, RPG_OP_SHAPED_PLANES } from "@orb/contracts/rpg";
import type { EditSnapshotParams } from "../contract/params.ts";
import type { HandDoorResult } from "../contract/results.ts";
import type { RpgContext, RpgService } from "../contract/service.ts";
import { assertHostRole, resolveMember } from "../guard.ts";
import { applyHandEdit } from "../snapshot-edit.ts";

export function createEditSnapshot(ctx: RpgContext): Pick<RpgService, "editSnapshot"> {
  async function editSnapshot(params: EditSnapshotParams): Promise<HandDoorResult> {
    const { game, role } = await resolveMember(ctx, params.principal, params.chatId);
    // The member-own-actor volatile arm is deferred (the per-actor sub-field lock grammar is unfixed — see the
    // file header); v1 gates editSnapshot host-only. The doorway is kept: a member gets a FORBIDDEN, not a lie.
    assertHostRole(ctx.can, params.principal, role, "host authority required to hand-edit the snapshot");
    // Gate 1 — plane legality, in two arms. The reason NAMES the writable planes: the caller is a hand (a host
    // at a keyboard, a console, an agent seed), and a refusal that doesn't say what IS writable just moves the
    // guess. The OP-SHAPED arm goes further and names the verb that owns the plane, because "actorState is not
    // a plane here" would be a lie — it is a plane with a better door.
    const opShaped = Object.keys(params.patch).filter((key) => RPG_OP_SHAPED_PLANES.has(key));
    if (opShaped.length > 0) {
      return {
        ok: false,
        reason: `${opShaped.join(", ")} is op-shaped — write one actor's fields with rpg.patchActor (per-field ops against the true head) and remove an actor with rpg.dismissActor; an image over this plane is unauthorable from the client's projections`,
      };
    }
    const unknownPlanes = Object.keys(params.patch).filter((key) => !RPG_HAND_PATCH_PLANES.has(key));
    if (unknownPlanes.length > 0) {
      return {
        ok: false,
        reason: `not snapshot-state planes: ${unknownPlanes.join(", ")} — writable planes are ${[...RPG_HAND_PATCH_PLANES].join(", ")} (locks ride lockPaths/releaseLocks, not the patch)`,
      };
    }
    // Auto-lock what the hand touched (manual-edit-wins). The caller may name the FINE paths it edited
    // (#10 — `params.lockPaths`, e.g. `actorState.user:<id>.status`) so the pin lands on the specific
    // datum; absent, the coarse default stamps every top-level patch key. `releaseLocks` clears the named
    // paths (the host's Release — "let the model write this again"; §12.3): the lock DELTA is `{lock,
    // clear}`, so a release-only call (empty patch) just drops the locks, and an edit-with-release does
    // both in one commit.
    const lockPaths = params.lockPaths ?? Object.keys(params.patch);
    const clearPaths = params.releaseLocks ?? [];
    // Gate 2 — the F1 write-boundary parse, inside the shared helper. A refusal wrote NOTHING (no row, no
    // slot, no locks), so there is no bus event to emit: the panel's rendered value is still the truth.
    const written = await applyHandEdit(ctx, game, params.patch, { lock: lockPaths, clear: clearPaths });
    if (!written.ok) {
      return { ok: false, reason: written.reason };
    }

    // The whole tracker panel re-resolves against the new resolved-current snapshot (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId: written.snapshotId });
    return { ok: true };
  }
  return { editSnapshot };
}
