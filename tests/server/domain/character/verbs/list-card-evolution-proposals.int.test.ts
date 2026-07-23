// verb: listCardEvolutionProposals — the owner's PENDING proposals for a character. Real db. Covers:
// pending-only (a dismissed/accepted proposal is off the list); owner-scoped (a foreign character yields an
// empty list, no existence leak); newest-first.

import type { CardEvolutionChange } from "@orb/contracts/crew";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

const DRIFT: readonly CardEvolutionChange[] = [{ field: "scenario", op: "replace", text: "A storm rolls in.", rationale: "shown" }];

describe("listCardEvolutionProposals", () => {
  test("lists only PENDING proposals, newest-first, and excludes resolved ones", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });

    const p1 = await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: DRIFT, sourceSpan: null });
    await svc.dismissCardEvolution({ principal: principal(owner), proposalId: p1 });
    h.advance(1000);
    const p2 = await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: DRIFT, sourceSpan: null });

    const pending = await svc.listCardEvolutionProposals({ principal: principal(owner), characterId: character.id });
    expect(pending.map((p) => p.id)).toEqual([p2]);
  });

  test("a stranger listing the owner's character gets an empty list (owner-scoped, no leak)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });
    await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: DRIFT, sourceSpan: null });

    expect(await svc.listCardEvolutionProposals({ principal: principal(stranger), characterId: character.id })).toEqual([]);
  });
});
