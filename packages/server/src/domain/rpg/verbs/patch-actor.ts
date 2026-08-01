// domain/rpg/verbs/patch-actor — patchActor (the actor-state review §5 R1). THE op-shaped hand door for one
// actor's volatile row, and the replacement for `editSnapshot`'s `actorState` IMAGE contract (which is now
// refused there, `RPG_OP_SHAPED_PLANES`). Host-gated on the shared plane, exactly as the image door was.
//
// WHAT THE SHAPE BUYS (the four defects the image contract produced — §2 of the review):
//   • the client no longer authors the plane, so it can no longer author it PARTIALLY (an image built from
//     projections that never contained the offstage rows);
//   • the client no longer FABRICATES an empty row for an actor it cannot see (the wipe class — an authored
//     `hp:null`/`inventory:[]` is a CLEAR, and the additive merge policy cannot undo a field a write NAMES);
//   • the row an op is applied to is read INSIDE the write's own head resolve (`writeHandState`), so a model
//     flush landing between the panel's read and the human's click is the BASE, not the casualty — the
//     stale-image clobber is unrepresentable, not merely unlikely;
//   • the auto-lock lands on the op's own FINE path (`substrate/actor-ops.ts` derives it) instead of whatever
//     path the client claimed it edited.
//
// The write does NOT go through `applyLockedPatch`: the ops already produced the whole next row against the
// true head, so there is no image to merge and no keyed-array policy to reason about. The plane's ADDITIVE
// policy (`merge.ts` `KEYED_ARRAYS`) is untouched — it governs the MODEL path, which still authors patches.
//
// THE MEMBER-OWN-VOLATILE DOORWAY (deferred, kept honest): the image door had to gate host-only because a
// member's whole-plane image could rewrite every actor in it. An op names its target ref, so the member arm is
// trivially scopable — `assertOwnUserRef(role, params.principal, params.targetRef)` in place of the host
// refusal below, plus a per-op field policy if the host ever wants to withhold one. Not built here (owner
// scope): a member gets a FORBIDDEN, not a lie.

import { actorRefKey } from "@orb/contracts/rpg";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { PatchActorParams } from "../contract/params";
import type { HandDoorResult } from "../contract/results";
import type { RpgContext, RpgService } from "../contract/service";
import { resolveMember } from "../guard";
import { writeHandState } from "../snapshot-edit";
import { applyActorOps, emptyActorVolatile } from "../substrate/actor-ops";

export function createPatchActor(ctx: RpgContext): Pick<RpgService, "patchActor"> {
  async function patchActor(params: PatchActorParams): Promise<HandDoorResult> {
    const { game, role } = await resolveMember(ctx, params.principal, params.chatId);
    if (role !== "host") {
      throw new DomainForbiddenError("host authority required to hand-edit an actor");
    }
    const targetKey = actorRefKey(params.targetRef);

    const written = await writeHandState(ctx, game, (head) => {
      const index = head.state.actorState.findIndex((a) => actorRefKey(a.actorRef) === targetKey);
      // A target with no row yet is MINTED here, so a first hand edit on a fresh actor is a real write and
      // never a silent no-op. The mint is the empty row (`emptyActorVolatile`) — the ops then write onto it,
      // so only the fields the human touched are authored (the fabricated-image wipe class needs an image).
      const base = head.state.actorState[index] ?? emptyActorVolatile(params.targetRef);
      const applied = applyActorOps(base, params.ops, () => ctx.ids.item());
      if (!applied.ok) {
        return { ok: false, reason: applied.reason };
      }
      const actorState = index === -1 ? [...head.state.actorState, applied.actor] : head.state.actorState.map((a, i) => (i === index ? applied.actor : a));
      // `autoLock:false` — a write to a field the MODEL CANNOT REACH (an item's host-picked `icon`) pins
      // nothing: there is no story write to stop, and a lock there is only a pin the host must release.
      const lock = params.autoLock === false ? [] : applied.lockPaths;
      return { ok: true, state: { ...head.state, actorState }, locks: { lock } };
    });
    if (!written.ok) {
      return { ok: false, reason: written.reason };
    }

    // The whole tracker panel re-resolves against the new resolved-current snapshot (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId: written.snapshotId });
    return { ok: true };
  }
  return { patchActor };
}
