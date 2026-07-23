// verb: acceptCardEvolution — the safety story. Real db. Covers: accept takes a `pre-evolution` snapshot
// FIRST (reversible), folds the PICKED changes onto the card (per-change accept — take one, reject another),
// flips the proposal to accepted (off the pending list), and emits `character.updated`. A non-pending accept
// refuses; a foreign proposal is a leak-free NOT_FOUND.

import type { CardEvolutionChange } from "@orb/contracts/crew";
import type { Db } from "@orb/db";
import { characterSnapshots } from "@orb/db";
import type { CardEvolutionProposalId, CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CardEvolutionProposalNotFoundError, CharacterOperationError, createCharacterService } from "@orb/server/domain/character";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** Read the stored `content` blob of the character's `pre-evolution` snapshot (verifies WHAT was captured,
 *  not just that a row exists — a future write-then-snapshot reorder would otherwise ship green). */
async function preEvolutionSnapshotContent(db: Db, characterId: CharacterId): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ content: characterSnapshots.content })
    .from(characterSnapshots)
    .where(and(eq(characterSnapshots.characterId, characterId), eq(characterSnapshots.label, "pre-evolution")));
  return rows[0]?.content as Record<string, unknown>;
}

const CHANGES: readonly CardEvolutionChange[] = [
  { field: "description", op: "append", text: "Now wary of open water.", rationale: "shown" },
  { field: "personality", op: "replace", text: "Bold and reckless.", rationale: "shown" },
];

describe("acceptCardEvolution", () => {
  test("snapshots pre-evolution FIRST, applies only the picked change, flips status, emits character.updated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "base", personality: "calm" } });
    const proposalId = await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: CHANGES, sourceSpan: null });
    h.events.length = 0;

    // Take only change 0 (the description append); reject change 1 (the personality rewrite).
    await svc.acceptCardEvolution({ principal: principal(owner), proposalId, pickedChangeIndices: [0] });

    const updated = await svc.get({ principal: principal(owner), characterId: character.id });
    expect(updated.description).toBe("base\n\nNow wary of open water.");
    expect(updated.personality).toBe("calm"); // rejected change never applied
    // A `pre-evolution` snapshot was captured BEFORE the write (accept is reversible) — and its STORED
    // CONTENT is the ORIGINAL card, not the evolved one. This pins the write ORDERING: a future
    // write-then-snapshot reorder would capture the mutated card and fail here (the label-only pin would not).
    const snaps = await svc.listSnapshots({ principal: principal(owner), characterId: character.id });
    expect(snaps.some((s) => s.label === "pre-evolution")).toBe(true);
    const snapshotContent = await preEvolutionSnapshotContent(db, character.id);
    expect(snapshotContent["description"]).toBe("base"); // the ORIGINAL, pre-fold value
    // The snapshot and the live card must DIFFER on exactly the changed field (proof the fold happened after).
    expect(snapshotContent["description"]).not.toBe(updated.description);
    // The proposal is off the pending list (flipped to accepted).
    expect(await svc.listCardEvolutionProposals({ principal: principal(owner), characterId: character.id })).toEqual([]);
    // The card body changed → the indexer must re-embed.
    expect(h.events).toEqual([{ type: "character.updated", characterId: character.id, contentChanged: true }]);
  });

  test("accepting an already-accepted proposal is refused (proposal_not_pending)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "base" } });
    const proposalId = await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: CHANGES, sourceSpan: null });
    await svc.acceptCardEvolution({ principal: principal(owner), proposalId });

    await expect(svc.acceptCardEvolution({ principal: principal(owner), proposalId })).rejects.toBeInstanceOf(CharacterOperationError);
  });

  test("accepting another owner's proposal is a leak-free NOT_FOUND", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "base" } });
    const proposalId = await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: CHANGES, sourceSpan: null });

    await expect(svc.acceptCardEvolution({ principal: principal(stranger), proposalId })).rejects.toBeInstanceOf(CardEvolutionProposalNotFoundError);
    // A never-existent id is the same leak-free answer.
    await expect(
      svc.acceptCardEvolution({ principal: principal(owner), proposalId: castId<CardEvolutionProposalId>("cardprop_ghost") }),
    ).rejects.toBeInstanceOf(CardEvolutionProposalNotFoundError);
  });
});
