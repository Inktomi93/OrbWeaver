// R4 PROMOTION's durable half: mint the card and seat it on the roster as the room host, with a uniquified handle
// and a stable provenance marker so an identical retry resolves the card it already made.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterHandle, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CharacterImportProvenance } from "#domain/character";
import { sha256Hex } from "#primitives/content-hash";
import { createRpgRoundsContext } from "#src/domain/rpg/context.ts";
import type { RpgRoundsAssemblyDeps, RpgRoundsDeps } from "#src/domain/rpg/contract/rounds.ts";
import type { RpgContext } from "#src/domain/rpg/contract/service.ts";

/** How many handle candidates the promotion mint probes before refusing (`vesna`, `vesna-2`, … `vesna-25`).
 *  The card HANDLE is a machine label in the owner's own namespace (the `__group__<chatId>` synthetic precedent
 *  — nothing addresses a character BY handle), so uniquifying it silently loses nothing; the display NAME is
 *  the identity, and a name collision is refused loudly by the verb instead. The bound exists so a pathological
 *  library cannot turn one promotion into an unbounded scan. */
const PROMOTE_HANDLE_ATTEMPTS = 25;

/** R4 — PROMOTION's durable half: mint the card + seat it on the roster, both AS THE ROOM HOST the verb
 *  resolved by role (threaded explicitly — the injected-op caller-gate class; an op that re-derived the owner
 *  here could mint a card into the wrong library). A promoted character MUST be host-owned, because
 *  `resolveRpgParticipants` reads participant character cards under the room host's ownership — a card owned by anyone
 *  else resolves to no actor at all and the promotion would land the person nowhere.
 *
 *  The handle is uniquified against the owner's library BEFORE the mint, so the reachable failure is a
 *  legible refusal rather than the unique-index error the insert would otherwise throw at the host. */
/** The first handle in the owner's library that nothing already carries, or `null` if every candidate is taken.
 *
 *  TWO PHASES, deliberately: the bare `handle` is probed ALONE first, because it is free on essentially every
 *  promotion and one indexed owner-scoped read is the honest cost of the common case. Only a real collision
 *  pays for the suffixed candidates, and those are asked for IN PARALLEL — they are independent questions, so
 *  a sequential walk would be a per-iteration round-trip for no ordering benefit. `findIndex` then restores
 *  the deterministic lowest-suffix answer, so the same collision always resolves to the same handle. */
async function freePromotionHandle(deps: RpgRoundsDeps, ownerId: UserId, handle: CharacterHandle): Promise<CharacterHandle | null> {
  if ((await deps.character.findByHandle({ ownerId, handle })) === null) {
    return handle;
  }
  const suffixed = Array.from({ length: PROMOTE_HANDLE_ATTEMPTS - 1 }, (_, i) => castId<CharacterHandle>(`${handle}-${i + 2}`));
  const taken = await Promise.all(suffixed.map((candidate) => deps.character.findByHandle({ ownerId, handle: candidate })));
  const index = taken.indexOf(null);
  return index === -1 ? null : (suffixed[index] ?? null);
}

type PromotionMarkerMatch = Awaited<ReturnType<RpgRoundsDeps["character"]["findByImportHash"]>>;

type PromotionResult = Awaited<ReturnType<RpgContext["promoteToCharacter"]>>;

async function resolveOrCreatePromotionCard(
  deps: RpgRoundsDeps,
  args: {
    readonly input: Parameters<RpgContext["promoteToCharacter"]>[0];
    readonly principal: Principal;
    readonly provenance: CharacterImportProvenance;
    readonly existing: PromotionMarkerMatch;
  },
): Promise<PromotionResult> {
  const { input, principal, provenance, existing } = args;
  if (existing !== null) {
    return { ok: true, characterId: existing.characterId };
  }
  const free = await freePromotionHandle(deps, input.hostUserId, input.handle);
  // Close the read/free-handle window: another identical invocation may have committed its marked card while
  // this one probed the handle namespace. Prefer that winner before considering a new insert.
  const winner = await deps.character.findByImportHash({ ownerId: input.hostUserId, importHash: provenance.importHash });
  if (winner !== null) {
    return { ok: true, characterId: winner.characterId };
  }
  if (free === null) {
    return {
      ok: false,
      reason: `your character library already carries "${input.handle}" and every variant this promotion tried — rename the character first`,
    };
  }
  try {
    const created = await deps.character.create({
      principal,
      input: { handle: free, name: input.name, description: input.description },
      provenance,
    });
    return { ok: true, characterId: created.id };
  } catch (err) {
    if (!deps.isHandleConflict(err)) {
      throw err;
    }
    // Identical retries choose the same lowest free handle. The unique loser accepts only the card carrying
    // this promotion's provenance; an unrelated constraint failure remains loud.
    const recovered = await deps.character.findByImportHash({ ownerId: input.hostUserId, importHash: provenance.importHash });
    if (recovered === null) {
      throw err;
    }
    return { ok: true, characterId: recovered.characterId };
  }
}

export function buildPromoteToCharacter(assembly: RpgRoundsAssemblyDeps): RpgContext["promoteToCharacter"] {
  const deps = createRpgRoundsContext(assembly);
  return async (input) => {
    const { chatId, hostUserId, sourceActorKey, participants, name } = input;
    const provenance = rpgPromotionProvenance(chatId, sourceActorKey);
    const existing = await deps.character.findByImportHash({ ownerId: hostUserId, importHash: provenance.importHash });
    const sameNameCollision = participants.some(
      (actor) =>
        actor.name.trim().toLowerCase() === name.toLowerCase() &&
        !(existing !== null && actor.actorRef.kind === "character" && actor.actorRef.characterId === existing.characterId),
    );
    if (sameNameCollision) {
      return {
        ok: false,
        reason: `"${name}" is already on this chat's roster — rename this character first, or the story could only ever address one of them`,
      };
    }
    const principal = await deps.resolveHostPrincipal(hostUserId);
    const card = await resolveOrCreatePromotionCard(deps, { input, principal, provenance, existing });
    if (!card.ok) {
      return card;
    }
    await deps.chat.addCharacterToChat({ principal, chatId, characterId: card.characterId });
    return card;
  };
}

/** Existing-column recovery marker for one promotion. The hash obeys character provenance's SHA-256 contract;
 * the source string is operational provenance, not a user-visible card field.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function rpgPromotionProvenance(chatId: ChatId, sourceActorKey: string): CharacterImportProvenance {
  const importedFrom = `rpg-promotion:v1:${chatId}:${sourceActorKey}`;
  return { importedFrom, importHash: sha256Hex(importedFrom) };
}
