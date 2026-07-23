// verb: dismissCardEvolution — the owner declines a proposal. Real db. Covers: a status flip to dismissed
// (off the pending list) that NEVER touches the card and emits no `character.updated`; a foreign proposal is
// a leak-free NOT_FOUND.

import type { CardEvolutionChange } from "@orb/contracts/crew";
import { CardEvolutionProposalNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

const DRIFT: readonly CardEvolutionChange[] = [{ field: "description", op: "append", text: "extra", rationale: "shown" }];

describe("dismissCardEvolution", () => {
  test("flips the proposal to dismissed without touching the card or emitting character.updated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "base" } });
    const proposalId = await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: DRIFT, sourceSpan: null });
    h.events.length = 0;

    await svc.dismissCardEvolution({ principal: principal(owner), proposalId });

    expect(await svc.listCardEvolutionProposals({ principal: principal(owner), characterId: character.id })).toEqual([]);
    const card = await svc.get({ principal: principal(owner), characterId: character.id });
    expect(card.description).toBe("base"); // untouched
    expect(h.events).toEqual([]); // no re-embed
  });

  test("dismissing another owner's proposal is a leak-free NOT_FOUND", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "base" } });
    const proposalId = await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: DRIFT, sourceSpan: null });

    await expect(svc.dismissCardEvolution({ principal: principal(stranger), proposalId })).rejects.toBeInstanceOf(CardEvolutionProposalNotFoundError);
  });
});
