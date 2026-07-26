// domain/rpg/verbs/patch-sheet — patchSheet (rpg-design/05 §4.4). The per-actor identity sheet write: host any actor;
// a member their OWN `user` ref. MA-4 patch semantics — every field optional, no defaults (an omitted field
// keeps its current value). Attribute keys are validated ∈ the profile vocabulary AND in range (§2.3). The row
// is created on FIRST WRITE (the persistence upsert); a `character` ref carries `characterId`, a `user` ref
// carries `userId` (the XOR the schema enforces).

import type { RpgActorRef, RpgSheet } from "@orb/contracts/rpg";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { PatchSheetParams } from "../contract/params";
import type { RpgContext, RpgGameRow, RpgService } from "../contract/service";
import { assertOwnUserRef, resolveMember } from "../guard";
import { findSheet, upsertSheet } from "../persistence/sheets";

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
  return { className: "", attributes: {}, poolDefs: [], maxHp: null, flavor: "" };
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

export function createPatchSheet(ctx: RpgContext): Pick<RpgService, "patchSheet"> {
  async function patchSheet(params: PatchSheetParams): Promise<void> {
    const { game, role } = await resolveMember(ctx, params.principal, params.chatId);
    assertOwnUserRef(role, params.principal, params.actorRef);
    const { characterId, userId } = actorIds(params.actorRef);

    if (params.patch.attributes !== undefined) {
      assertAttributes(game, params.patch.attributes);
    }

    const actor = characterId !== null ? { characterId } : { userId: userId as UserId };
    const current = (await findSheet(ctx.db, game.id, actor))?.sheet ?? defaultSheet();
    // MA-4: an omitted field keeps its current value. `maxHp` uses key-presence (`"maxHp" in patch`), NOT
    // `??`, because a passed `null` is a REAL value ("clear the health bar") — `??` would swallow it.
    const next: RpgSheet = {
      className: params.patch.className ?? current.className,
      attributes: params.patch.attributes !== undefined ? { ...params.patch.attributes } : current.attributes,
      poolDefs: params.patch.poolDefs !== undefined ? [...params.patch.poolDefs] : current.poolDefs,
      maxHp: "maxHp" in params.patch ? (params.patch.maxHp ?? null) : current.maxHp,
      flavor: params.patch.flavor ?? current.flavor,
    };

    const row = await upsertSheet(ctx.db, { id: ctx.ids.sheet(), gameId: game.id, characterId, userId, sheet: next, now: ctx.now() });

    // The Status/Sheet tabs refetch (§4.9). `sheetId` is the row's real id (upsert may reuse an existing row).
    ctx.emitBus({ type: "sheetChanged", chatId: params.chatId, sheetId: row.id });
  }
  return { patchSheet };
}
