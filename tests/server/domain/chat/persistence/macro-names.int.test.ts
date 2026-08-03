// persistence/macro-names — proves the CHAT MACRO NAME PRODUCER loader (Chat-Macro-Resolution.md §1) against
// a real libSQL db: member-gated coverage (participants' seat/active-persona ids UNION a loaded set of
// message rows' stamps), dedup across the two sources, and the empty-input no-query floor.

import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveRowMacros } from "@orb/kit/macro";
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
    const owner = await seedUser(db, castId<Handle>("owner"));
    await seedChat(db, "a");
    const charId = await seedCharacter(db, owner, "aria");
    const personaId = await seedPersona(db, owner, "nyx");

    const producer = await loadChatMacroNameProducer(db, {
      participants: [{ characterId: charId, activePersonaId: personaId }],
    });
    expect(producer.characterNames).toEqual([{ id: charId, name: "aria" }]);
    expect(producer.personaNames).toEqual([{ id: personaId, name: "nyx", description: "nyx description" }]);
  });

  test("covers a message-stamped id NOT on any participant (a since-switched persona)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const activePersona = await seedPersona(db, owner, "zara");
    const oldPersona = await seedPersona(db, owner, "mara");

    const producer = await loadChatMacroNameProducer(db, {
      participants: [{ characterId: null, activePersonaId: activePersona }],
      messages: [{ characterId: null, personaId: oldPersona }],
    });
    // Both the participant's CURRENT active persona and the message's HISTORICAL stamp resolve.
    expect(new Set(producer.personaNames.map((p) => p.id))).toEqual(new Set([activePersona, oldPersona]));
  });

  test("dedupes an id referenced by BOTH a participant and a message row (one query, one entry)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
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

// ── task #59 S6: multi-human — the producer is MEMBER-gated (any id the chat references), never
// OWNER-scoped. `loadChatMacroNameProducer` takes no caller/owner argument at all; these pin that a
// persona owned by a DIFFERENT user than the chat's host still resolves (names only, per §1's header —
// a co-participant's persona name is not a secret), and that each participant's own row-stamped persona
// resolves independently through the shared atom.
describe("persistence/macro-names — multi-human coverage is member-gated, not owner-gated (§1)", () => {
  test("a persona owned by a DIFFERENT user than the chat's host still resolves (no owner filter)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const hostPersona = await seedPersona(db, host, "host_pov");
    const memberPersona = await seedPersona(db, member, "member_pov");
    await seedChat(db, "a");

    const producer = await loadChatMacroNameProducer(db, {
      participants: [
        { characterId: null, activePersonaId: hostPersona },
        { characterId: null, activePersonaId: memberPersona },
      ],
    });

    // Both resolve — the loader has no notion of "whose chat this is"; it resolves whatever ids the
    // membership layer already collected. A member's OWN persona is not gated behind the host's ownership.
    expect(new Set(producer.personaNames.map((p) => p.name))).toEqual(new Set(["host_pov", "member_pov"]));
    expect(producer.personaNames.map((p) => p.id)).toEqual(expect.arrayContaining([hostPersona, memberPersona]));
  });

  test("rows stamped with DIFFERENT participants' personaIds each resolve {{user}} to THEIR OWN persona", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const hostPersona = await seedPersona(db, host, "nova");
    const memberPersona = await seedPersona(db, member, "juno");
    await seedChat(db, "a");

    // The producer covers cross-participant names via the message-stamped half of §1's coverage union.
    const producer = await loadChatMacroNameProducer(db, {
      messages: [
        { characterId: null, personaId: hostPersona },
        { characterId: null, personaId: memberPersona },
      ],
    });
    const characterNamesById = buildCharacterNameMap(producer.characterNames);
    const personaNamesById = buildPersonaNameMap(producer.personaNames);

    // Each row's OWN stamp resolves independently through the shared atom (Chat-Macro-Resolution.md §2) —
    // the host's row is never retargeted to the member's persona or vice versa.
    expect(
      resolveRowMacros(
        "{{user}} waves",
        { characterId: null, personaId: hostPersona },
        {
          characterNamesById,
          personaNamesById,
        },
      ),
    ).toBe("nova waves");
    expect(
      resolveRowMacros(
        "{{user}} waves",
        { characterId: null, personaId: memberPersona },
        {
          characterNamesById,
          personaNamesById,
        },
      ),
    ).toBe("juno waves");
  });
});
