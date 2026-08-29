// verb: applyToChat — additively materialize a saved party onto an EXISTING chat the caller HOSTS, by
// driving chat's OWN injected verbs (never a second participant-insert path — D61 B6). Authority is
// owner-of-preset ∧ host-of-chat: the first is this domain's owner-scoped read, the second is chat's
// own `requireHost` — injected, and run FIRST, before ANY read of the target room (without it, an apply
// whose members are all already present and whose preset carries no config would fire zero host-gated
// ops and hand a non-host caller a roster-intersection oracle).
//
// Additive only (never kicks — the host prunes by hand) and IDEMPOTENT: a re-apply mints nothing
// (chat's `addCharacterToChat` present-seat floor returns the live seat) and RE-STAMPS the seat knobs —
// `disabled` always (NOT NULL in the junction, so the stored value IS the preset's answer),
// `talkativeness` only when the preset stores one (NULL = inherit the chat default). Members apply
// SEQUENTIALLY in position order — join order is visible in the roster UI, so the awaits in the loop
// are the semantics, not an accident. `skipped` is the PRE-DRIVE re-verify arm ONLY (stickler F3
// truth-repair): the FK CASCADE makes a stale member unrepresentable at rest, so the re-verify catches
// just the delete-between-read-and-verify window and drops those members from the drive, reported. A
// failure INSIDE the drive (an injected chat verb throwing) SURFACES and aborts the loop — deliberately
// not collected: distinguishing "this member's character died" from "the room died" inside a
// DomainNotFoundError would need error-class sniffing across the domain line, and the additive +
// idempotent contract already makes a retry converge (landed seats re-classify alreadyPresent).

import type { CharacterId } from "@orb/kit/ids";
import type { RosterPresetContext } from "../context.ts";
import { RosterPresetNotFoundError } from "../contract/errors.ts";
import type { ApplyRosterPresetParams } from "../contract/params.ts";
import type { RosterPresetService } from "../contract/service.ts";
import { loadMemberRows, loadOwnedPresetRow } from "../persistence/queries.ts";

export function createApplyToChat(ctx: RosterPresetContext): RosterPresetService["applyToChat"] {
  return async ({ principal, presetId, chatId }: ApplyRosterPresetParams) => {
    const ownerId = principal.userId;
    const preset = await loadOwnedPresetRow(ctx.db, ownerId, presetId);
    if (preset === undefined) {
      throw new RosterPresetNotFoundError(presetId);
    }
    // Host authority FIRST (see the header) — a stranger and a dead room collapse to chat's own
    // leak-free NOT_FOUND, asserted THROUGH the injected guard so no second authority path exists.
    await ctx.chat.requireHost(principal, chatId);
    const memberRows = await loadMemberRows(ctx.db, presetId);
    const ownedNow = new Set(
      await ctx.verifyCharactersOwned(
        ownerId,
        memberRows.map((m) => m.characterId),
      ),
    );
    const present = new Map((await ctx.chat.listPresentCharacterSeats(chatId)).map((seat) => [seat.characterId, seat.participantId]));
    const added: CharacterId[] = [];
    const alreadyPresent: CharacterId[] = [];
    const skipped: CharacterId[] = [];
    for (const member of memberRows) {
      if (!ownedNow.has(member.characterId)) {
        skipped.push(member.characterId);
        continue;
      }
      let participantId = present.get(member.characterId);
      if (participantId === undefined) {
        const seat = await ctx.chat.addCharacterToChat({ principal, chatId, characterId: member.characterId });
        participantId = seat.id;
        added.push(member.characterId);
      } else {
        alreadyPresent.push(member.characterId);
      }
      await ctx.chat.setSeatKnobs({
        principal,
        chatId,
        participantId,
        patch: { disabled: member.disabled, ...(member.talkativeness !== null ? { talkativeness: member.talkativeness } : {}) },
      });
    }
    let configApplied = false;
    if (preset.groupConfig !== null) {
      // Parse-at-apply is CHAT's (`setGroupConfig` re-parses the stored input) — a preset WITHOUT a
      // config never touches the room's existing config.
      await ctx.chat.setGroupConfig({ principal, chatId, config: preset.groupConfig });
      configApplied = true;
    }
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "rosterPreset.applyToChat",
        entityType: "roster_preset",
        entityId: presetId,
        metadata: { chatId, added: added.length, alreadyPresent: alreadyPresent.length, skipped: skipped.length, configApplied },
      },
      ctx.now(),
    );
    // No `rosterPresetsChanged` here — an apply mutates the CHAT (which fans `chatUpdated` through the
    // injected verbs); the library rows are untouched.
    return { added, alreadyPresent, skipped, configApplied };
  };
}
