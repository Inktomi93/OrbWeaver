// Turn voice binds to the consenting human, never to a presence-order bystander.
import type { PersonaId, UserId } from "@orb/kit/ids";
import { resolvePersonaDescriptionPlacement } from "@orb/kit/persona";
import type { ResolvePersonasForParticipants } from "#domain/persona";
import type { HumanSeatPersona, ResolvedPersonas, ResolveForeignInputsOp, TurnTrigger, TurnVoice } from "../contract/foreign.ts";

/**
 * THE TRIGGER BINDING — which persona id prompt-config `{{user}}` (the assemble ctx's ACTIVE persona)
 * resolves against on a `trigger`-voice turn (an impersonate draft — see {@link voicePersonaFor}), dispatched
 * exhaustively over {@link TurnTrigger} (Chat-Macro-Resolution §3–§4; the union's own doc carries the arm
 * semantics). PURE; exported for its unit pin only — not a composition surface.
 *
 *   • `human`  → THAT human's persona ("who's speaking right now", §A.1), and `null` when their seat holds
 *     none — the kit floor, NEVER the anchor. Borrowing the anchor here is INVITE-JOIN-NULL-PERSONA: it
 *     hands a member the host's identity on the wire.
 *   • `none` (deferred drain / auto turn) → the chat ANCHOR. The anchor is the chat-invariant identity (D51
 *     rider); binding to `personaIds[0]` instead would address the prompt to a presence-order-arbitrary
 *     bystander, and falling to the kit floor would address `DEFAULT_PERSONA_NAME` in a room whose `{{user}}` is well-defined.
 *
 * THERE IS NO ABSENT ARM (owner ruling, 2026-08-07 — the `personaIds[0]` fallback is RETIRED). It used to
 * exist for trigger-less contexts (previews, host instruments) and bound `{{user}}` to "whoever joined
 * first" — presence-order-arbitrary, nondeterministic across a join, and on a host instrument a cross-member
 * read. Every caller now states its arm, and `trigger` is REQUIRED rather than loud-at-runtime: a caller that
 * genuinely has no triggering human passes `{kind:"none"}` (⇒ the anchor, the chat-invariant identity), which
 * is what a preview wanted all along. The enforcement ladder prefers unrepresentable over thrown (§2.2).
 *
 * Returning an ID (not a resolved persona) is deliberate: the anchor arm then resolves through the SAME
 * participants read as every other arm, so `active === anchor` is byte-identical to the anchor projection and the
 * `sameProjectedPersona` dedup keeps holding.
 */
export function activePersonaIdFor(args: { readonly trigger: TurnTrigger; readonly anchorPersonaId: PersonaId | null }): PersonaId | null {
  const trigger = args.trigger;
  switch (trigger.kind) {
    case "human":
      return trigger.personaId;
    case "none":
      return args.anchorPersonaId;
    default:
      return assertNeverTrigger(trigger);
  }
}

function assertNeverTrigger(trigger: never): never {
  throw new Error(`activePersonaIdFor: unhandled TurnTrigger ${JSON.stringify(trigger)}`);
}

/**
 * THE VOICE BINDING (D122 as amended) — which persona id prompt-config `{{user}}` resolves against, and whose
 * persona it is. PURE; exported for its unit pin.
 *
 *   • `anchor` (every canon turn) → the anchor HUMAN's current seat persona. The anchor human owns the anchor
 *     persona when it resolved under the consent gate, else the frozen host. Who pressed send never enters, so
 *     the system block and every history label are byte-identical across senders. A mid-chat persona swap
 *     still splits the two personas: the card keeps the anchor persona, the preset follows the seat. An empty
 *     seat falls back to the anchor persona its human owns, never to another human's.
 *   • `trigger` (an impersonate draft, the presser's own next line) → {@link activePersonaIdFor}.
 */
export function voicePersonaFor(args: {
  readonly voice: TurnVoice;
  readonly trigger: TurnTrigger;
  readonly anchorPersonaId: PersonaId | null;
  readonly anchorOwnerId: UserId | null;
  readonly runAsUserId: UserId;
  readonly humanSeats: readonly HumanSeatPersona[];
}): { readonly personaId: PersonaId | null; readonly userId: UserId } {
  const anchorHuman = args.anchorOwnerId ?? args.runAsUserId;
  const voice = args.voice;
  switch (voice) {
    case "anchor": {
      // An anchor human whose seat holds no persona speaks as the anchor persona they own; with no resolved
      // anchor the frozen host's empty seat is the honest kit floor.
      const seatPersonaId = args.humanSeats.find((seat) => seat.userId === anchorHuman)?.personaId ?? null;
      return { personaId: seatPersonaId ?? (args.anchorOwnerId === null ? null : args.anchorPersonaId), userId: anchorHuman };
    }
    case "trigger":
      return {
        personaId: activePersonaIdFor({ trigger: args.trigger, anchorPersonaId: args.anchorPersonaId }),
        userId: args.trigger.kind === "human" ? args.trigger.userId : anchorHuman,
      };
    default:
      return assertNeverVoice(voice);
  }
}

function assertNeverVoice(voice: never): never {
  throw new Error(`voicePersonaFor: unhandled TurnVoice ${JSON.stringify(voice)}`);
}

/** The persona half of the FOREIGN read: one consent-gated persona read over the anchor, the trigger's persona
 *  and every seat persona, plus the room's pin read through `chatId`, then {@link voicePersonaFor}. Every other
 *  seat's resolved persona projects into `people` in seat order, so the block moves only on a join, a leave, a
 *  swap or a re-anchor. Personas are
 *  single-owned and `setActivePersona` seats only the target's own, so no two seats hold one persona. The
 *  composition root's `resolveForeignInputs` is its one production caller. */
export function createTurnPersonaResolver(
  resolvePersonasForParticipants: ResolvePersonasForParticipants,
): (
  args: Pick<Parameters<ResolveForeignInputsOp>[0], "anchorPersonaId" | "chatId" | "humanSeats" | "presentHumanUserIds" | "runAsUserId" | "trigger" | "voice">,
) => Promise<ResolvedPersonas> {
  return async (args): Promise<ResolvedPersonas> => {
    const triggerPersonaId = args.trigger.kind === "human" ? args.trigger.personaId : null;
    const resolved = await resolvePersonasForParticipants({
      chatId: args.chatId,
      personaIds: [args.anchorPersonaId, triggerPersonaId, ...args.humanSeats.map((seat) => seat.personaId)].flatMap((id) => (id === null ? [] : [id])),
      allowedOwnerIds: args.presentHumanUserIds,
    });
    const project = (personaId: PersonaId | null): ResolvedPersonas["active"] => {
      const p = personaId === null ? undefined : resolved.get(personaId);
      return p === undefined ? null : { name: p.name, description: p.description, placement: resolvePersonaDescriptionPlacement(p.metadata) };
    };
    // A held pin (its owner left or is disabled) still names the card's persona, but its owner is no voice
    // here: preset {{user}} binds to the frozen host's seat (ADR 0250), so the owner must be in the consent set.
    const anchorRowOwner = args.anchorPersonaId === null ? null : (resolved.get(args.anchorPersonaId)?.ownerId ?? null);
    const anchorOwnerId = anchorRowOwner !== null && args.presentHumanUserIds.includes(anchorRowOwner) ? anchorRowOwner : null;
    const voice = voicePersonaFor({ ...args, anchorOwnerId });
    const people = args.humanSeats.flatMap((seat) => {
      const persona = seat.userId === voice.userId ? null : project(seat.personaId);
      return persona === null ? [] : [persona];
    });
    return {
      anchor: project(args.anchorPersonaId),
      active: project(voice.personaId),
      activeUserId: voice.userId,
      ...(people.length > 0 ? { people } : {}),
    };
  };
}
