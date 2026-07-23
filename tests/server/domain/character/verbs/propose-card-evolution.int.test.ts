// verb: proposeCardEvolution — the ENV-ONLY producer op (no principal). Real db. Covers: a chat-scoped
// filing inserts a pending row AND emits the `crew.cardProposalCreated` domain-event mirror; a chat-LESS
// filing (import/human) inserts but emits NOTHING (no ChatId to key the event); a re-file for the same
// (characterId, chatId) SUPERSEDES the prior pending (a newer audit wins).

import type { CardEvolutionChange } from "@orb/contracts/crew";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedChat } from "../../chat/_support.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

const DRIFT: readonly CardEvolutionChange[] = [{ field: "description", op: "append", text: "Now wary of open water.", rationale: "shown repeatedly" }];

describe("proposeCardEvolution", () => {
  test("a chat-scoped filing inserts a pending proposal and emits crew.cardProposalCreated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });
    const chatId = await seedChat(db, "prov");
    h.events.length = 0;

    const proposalId = await svc.proposeCardEvolution({ characterId: character.id, chatId, changes: DRIFT, sourceSpan: { fromSeq: 0, toSeq: 40 } });

    const pending = await svc.listCardEvolutionProposals({ principal: principal(owner), characterId: character.id });
    expect(pending.map((p) => p.id)).toEqual([proposalId]);
    expect(pending[0]?.changes).toEqual(DRIFT);
    expect(h.events).toEqual([{ type: "crew.cardProposalCreated", chatId, characterId: character.id, proposalId }]);
  });

  test("a chat-less filing inserts but emits no crew event (not crew activity)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });
    h.events.length = 0;

    const proposalId = await svc.proposeCardEvolution({ characterId: character.id, chatId: null, changes: DRIFT, sourceSpan: null });

    const pending = await svc.listCardEvolutionProposals({ principal: principal(owner), characterId: character.id });
    expect(pending.map((p) => p.id)).toEqual([proposalId]);
    expect(h.events).toEqual([]);
  });

  test("a re-file for the same (characterId, chatId) supersedes the prior pending", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });
    const chatId = await seedChat(db, "prov");

    const first = await svc.proposeCardEvolution({ characterId: character.id, chatId, changes: DRIFT, sourceSpan: null });
    const second = await svc.proposeCardEvolution({ characterId: character.id, chatId, changes: DRIFT, sourceSpan: null });

    const pending = await svc.listCardEvolutionProposals({ principal: principal(owner), characterId: character.id });
    // Only the newest remains pending; the first was flipped to superseded (not deleted — off the pending list).
    expect(pending.map((p) => p.id)).toEqual([second]);
    expect(pending.map((p) => p.id)).not.toContain(first);
  });
});
