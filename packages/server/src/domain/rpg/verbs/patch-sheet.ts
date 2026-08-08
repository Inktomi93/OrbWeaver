// domain/rpg/verbs/patch-sheet — patchSheet (rpg-design/05 §4.4). The per-actor identity sheet write: host any actor;
// a member their OWN `user` ref. MA-4 patch semantics — every field optional, no defaults (an omitted field
// keeps its current value). Attribute keys are validated ∈ the profile vocabulary AND in range (§2.3). The row
// is created on FIRST WRITE (the persistence upsert); a `character` ref carries `characterId`, a `user` ref
// carries `userId` (the XOR the schema enforces).
//
// TWO AUTHORITY FLOORS, NOT ONE. `assertOwnUserRef` answers "whose ROW may I write"; it cannot answer "which
// FIELDS of that row are mine", and the tracker EXCEPTIONS are the one pair that differs on that second axis.
// `trackerGrants`/`trackerRevokes` decide which meters an actor CARRIES — the applicability model the host
// authors from the Tracker access editor ("grants are the host's call",
// `client/features/rpg/components/rpg-tracker-grants.tsx`). Until 2026-08-07 that invariant lived only in the
// client's PERMISSION-omit of the control, so a member could self-grant or self-revoke a meter on their own
// `user` sheet by hand-sending the field — game integrity, not cross-tenant. The gate is now here, at the write
// boundary, on the SAME injected `can()` seam every other rpg host answer runs through (`guard.ts`): a member
// naming either field is REFUSED (the domain's convention for a non-member-writable plane — rpg rejects with a
// verb-specific `DomainForbidden` sentence, it never silently strips), and every other field of the same patch
// is untouched, so ordinary self-editing (className/attributes/flavor/level) still works.

import type { ParticipantRole } from "@orb/contracts/identity";
import type { RpgActorRef, RpgSheet } from "@orb/contracts/rpg";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { PatchSheetParams } from "../contract/params.ts";
import type { RpgContext, RpgGameRow, RpgService } from "../contract/service.ts";
import { assertHostRole, assertOwnUserRef, resolveMember } from "../guard.ts";
import { findSheet, upsertSheet } from "../persistence/sheets.ts";

/** Validate a patched attributes record against the game's profile: every key ∈ the profile's attribute
 *  vocabulary, every value within `[range.min, range.max]` (§2.3). */
function assertAttributes(game: RpgGameRow, attributes: Readonly<Record<string, number>>): void {
  const profile = game.config.statProfile;
  const vocab = new Set(profile.attributes.map((a) => a.key));
  for (const [key, value] of Object.entries(attributes)) {
    if (!vocab.has(key)) {
      throw new DomainOperationError("rpg_unknown_attribute", `attribute "${key}" is not in the profile`);
    }
    if (value < profile.range.min || value > profile.range.max) {
      throw new DomainOperationError(
        "rpg_attribute_out_of_range",
        `attribute "${key}" (${value}) is out of range [${profile.range.min}, ${profile.range.max}]`,
      );
    }
  }
}

/** The default sheet a first-write patch merges onto (a missing row = the default sheet, §4.3). */
function defaultSheet(): RpgSheet {
  return { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] };
}

/** The actor-id split the persistence upsert takes (a `character` ref → characterId; a `user` ref → userId). */
function actorIds(ref: RpgActorRef): { characterId: CharacterId | null; userId: UserId | null } {
  if (ref.kind === "character") {
    return { characterId: ref.characterId, userId: null };
  }
  if (ref.kind === "user") {
    return { characterId: null, userId: ref.userId };
  }
  // `cast` actors have no identity sheet (they are scene-only NPCs — their state is the volatile plane).
  throw new DomainOperationError("rpg_cast_has_no_sheet", "a cast actor has no identity sheet");
}

/** Merge the MA-4 patch onto the current sheet (omit = keep). `level` uses key-presence (`"level" in patch`),
 *  NOT `??`, because a passed `null` is a REAL clear value ("clear the level") — `??` would swallow it.
 *  Hoisted so `patchSheet` stays under the cognitive-complexity gate. `maxHp` is gone with hp's demotion (R3):
 *  a meter's per-carrier ceiling has ONE home now, on the tracker value. */
function mergeSheet(current: RpgSheet, patch: PatchSheetParams["patch"]): RpgSheet {
  return {
    className: patch.className ?? current.className,
    attributes: patch.attributes !== undefined ? { ...patch.attributes } : current.attributes,
    // The per-actor tracker EXCEPTIONS — whole-list replace on a passed array, keep on omit (MA-4). Tracker
    // DEFS are not reachable here: they home once in `config.trackers` (`updateConfig` is their door). Reaching
    // EITHER of these two fields is HOST-gated one level up (see the file header + `assertTrackerExceptionHost`);
    // by the time the merge runs, a member's patch provably names neither.
    trackerGrants: patch.trackerGrants !== undefined ? [...patch.trackerGrants] : current.trackerGrants,
    trackerRevokes: patch.trackerRevokes !== undefined ? [...patch.trackerRevokes] : current.trackerRevokes,
    flavor: patch.flavor ?? current.flavor,
    // §2.6 hand-only level — no TURN can write it (absent from extraction + tool args); the only other door is
    // the host born-state round (`populateFromCharacter`), which FILLS it from the card while it is still null.
    level: "level" in patch ? (patch.level ?? null) : current.level,
  };
}

/** The per-FIELD host floor over the sheet's two tracker-exception lists (see the file header). Fires only when
 *  the patch actually NAMES one of them — key-presence, the same MA-4 test `mergeSheet` uses, so an omitted
 *  field is not a host ask and a member's ordinary self-edit is byte-identically unaffected. The verdict is the
 *  kernel's (`ctx.can`, through `assertHostRole`); this only decides WHEN to ask. */
function assertTrackerExceptionHost(ctx: RpgContext, params: PatchSheetParams, role: ParticipantRole): void {
  if (params.patch.trackerGrants === undefined && params.patch.trackerRevokes === undefined) {
    return;
  }
  assertHostRole(ctx.can, params.principal, role, "host authority required to grant or revoke a tracker exception");
}

export function createPatchSheet(ctx: RpgContext): Pick<RpgService, "patchSheet"> {
  async function patchSheet(params: PatchSheetParams): Promise<void> {
    const { game, role } = await resolveMember(ctx, params.principal, params.chatId);
    assertOwnUserRef(ctx.can, params.principal, role, params.actorRef);
    // …and the second floor: WHOSE row is not the same question as WHICH FIELDS. Both refusals land before any
    // read of the current sheet, so a refused patch touches nothing and emits nothing.
    assertTrackerExceptionHost(ctx, params, role);
    const { characterId, userId } = actorIds(params.actorRef);

    if (params.patch.attributes !== undefined) {
      assertAttributes(game, params.patch.attributes);
    }

    const actor = characterId !== null ? { characterId } : { userId: userId as UserId };
    const current = (await findSheet(ctx.db, game.id, actor))?.sheet ?? defaultSheet();
    const next = mergeSheet(current, params.patch);

    const row = await upsertSheet(ctx.db, { id: ctx.ids.sheet(), gameId: game.id, characterId, userId, sheet: next, now: ctx.now() });

    // The Status/Sheet tabs refetch (§4.9). `sheetId` is the row's real id (upsert may reuse an existing row).
    ctx.emitBus({ type: "sheetChanged", chatId: params.chatId, sheetId: row.id });
  }
  return { patchSheet };
}
