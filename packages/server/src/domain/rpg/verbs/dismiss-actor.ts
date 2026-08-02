// domain/rpg/verbs/dismiss-actor — dismissActor (the actor-state review §5 R1). THE removal gesture for the
// actor plane, and the reason the plane's additive policy is now honest: `substrate/merge.ts` says an actor
// "leaves the plane by a real gesture, never by going unmentioned" — until this verb there WAS no such
// gesture. Nothing removed an `actorState` element: omission never removes (additive policy), no tool removes
// an actor, the hand image could not remove, and `resyncFromStory` merges through the same additive plane. A
// hallucinated NPC minted once stayed reachable, `targetRef`-enumerated and clone-forwarded into every
// snapshot, forever; only a checkpoint restore (a rewind, not a gesture) ever shrank the plane.
//
// It is ONE gesture over THREE couplings, because half a dismissal is a ghost:
//   • the `actorState` row — dropped (the state the review found irremovable);
//   • the scene PRESENCE entry — dropped (an NPC dismissed from the game must not still stand in the scene;
//     since R2 presence is a flat `actorRefKey` list, so this is one filter for every actor kind);
//   • every LOCK at or below the actor's path — released (the `deleteQuest` symmetric-lock precedent: a
//     removed element leaves no ghost lock, or the host is left with pins on an actor that no longer exists,
//     and a later re-mint of the same key would be born silently frozen).
//
// Host-gated (a shared plane). Refusal is errors-as-data: dismissing an actor the game does not carry says so
// rather than reporting a write that removed nothing.

import { actorRefKey, rpgActorLockBase } from "@orb/contracts/rpg";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { DismissActorParams } from "../contract/params";
import type { HandDoorResult } from "../contract/results";
import type { RpgContext, RpgService } from "../contract/service";
import { resolveMember } from "../guard";
import { writeHandState } from "../snapshot-edit";

export function createDismissActor(ctx: RpgContext): Pick<RpgService, "dismissActor"> {
  async function dismissActor(params: DismissActorParams): Promise<HandDoorResult> {
    const { game, role } = await resolveMember(ctx, params.principal, params.chatId);
    if (role !== "host") {
      throw new DomainForbiddenError("host authority required to dismiss an actor");
    }
    const ref = params.targetRef;
    const targetKey = actorRefKey(ref);
    const lockBase = rpgActorLockBase(ref);

    const written = await writeHandState(ctx, game, (head) => {
      const actorState = head.state.actorState.filter((a) => actorRefKey(a.actorRef) !== targetKey);
      // The presence half — since R2 the presence plane is a flat list of actor-ref KEYS, so dropping an
      // actor's presence is the same one-key filter for every kind (roster refs included). It used to need a
      // per-kind join because identity and presence were fused on the cast row.
      const presentCharacters = head.state.presentCharacters.filter((key) => key !== targetKey);
      if (actorState.length === head.state.actorState.length && presentCharacters.length === head.state.presentCharacters.length) {
        return { ok: false, reason: `no actor "${targetKey}" in this game's state — nothing to dismiss` };
      }
      // The symmetric lock release: the element's own path and every fine pin under it.
      const clear = Object.keys(head.locks ?? {}).filter((path) => path === lockBase || path.startsWith(`${lockBase}.`));
      return { ok: true, state: { ...head.state, actorState, presentCharacters }, locks: { clear } };
    });
    if (!written.ok) {
      return { ok: false, reason: written.reason };
    }

    // A dismissal is a snapshot write: the whole panel re-resolves (§4.9) — the roster, the scene cast, and
    // every projection that read the departed row.
    ctx.emitBus({ type: "snapshotPatched", chatId: params.chatId, snapshotId: written.snapshotId });
    return { ok: true };
  }
  return { dismissActor };
}
