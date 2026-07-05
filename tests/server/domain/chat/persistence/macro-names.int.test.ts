// persistence/macro-names — proves the CHAT MACRO NAME PRODUCER loader (Chat-Macro-Resolution.md §1) against
// a real libSQL db: member-gated coverage (participants' seat/active-persona ids UNION a loaded set of
// message rows' stamps), dedup across the two sources, and the empty-input no-query floor.

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { loadChatMacroNameProducer } from "../../../../../packages/server/src/domain/chat/persistence/macro-names";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedChat, seedPersona, seedUser } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("persistence/macro-names — loadChatMacroNameProducer (§1 member-gated coverage)", () => {
  test("covers a participant's seated character + active persona", async () => {
    const owner = await seedUser(db, "owner");
    await seedChat(db, "a");
    const charId = await seedCharacter(db, owner, "aria");
    const personaId = await seedPersona(db, owner, "nyx");

    const producer = await loadChatMacroNameProducer(db, {
      participants: [{ characterId: charId, activePersonaId: personaId }],
    });
    expect(producer.characterNames).toEqual([{ id: charId, name: "aria" }]);
    expect(producer.personaNames).toEqual([
      { id: personaId, name: "nyx", description: "nyx description" },
    ]);
  });

  test("covers a message-stamped id NOT on any participant (a since-switched persona)", async () => {
    const owner = await seedUser(db, "owner");
    const activePersona = await seedPersona(db, owner, "zara");
    const oldPersona = await seedPersona(db, owner, "mara");

    const producer = await loadChatMacroNameProducer(db, {
      participants: [{ characterId: null, activePersonaId: activePersona }],
      messages: [{ characterId: null, personaId: oldPersona }],
    });
    // Both the participant's CURRENT active persona and the message's HISTORICAL stamp resolve.
    expect(new Set(producer.personaNames.map((p) => p.id))).toEqual(
      new Set([activePersona, oldPersona]),
    );
  });

  test("dedupes an id referenced by BOTH a participant and a message row (one query, one entry)", async () => {
    const owner = await seedUser(db, "owner");
    const charId = await seedCharacter(db, owner, "kai");

    const producer = await loadChatMacroNameProducer(db, {
      participants: [{ characterId: charId, activePersonaId: null }],
      messages: [
        { characterId: charId, personaId: null },
        { characterId: charId, personaId: null },
      ],
    });
    expect(producer.characterNames).toHaveLength(1);
  });

  test("null participants/messages ids are skipped; no ids ⇒ empty producer, no query", async () => {
    const producer = await loadChatMacroNameProducer(db, {
      participants: [{ characterId: null, activePersonaId: null }],
      messages: [{ characterId: null, personaId: null }],
    });
    expect(producer).toEqual({ characterNames: [], personaNames: [] });
  });

  test("both args omitted ⇒ empty producer (the getChat-with-no-roster floor)", async () => {
    expect(await loadChatMacroNameProducer(db, {})).toEqual({
      characterNames: [],
      personaNames: [],
    });
  });
});
