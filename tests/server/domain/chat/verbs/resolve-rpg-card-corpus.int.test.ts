// op: resolveRpgCardCorpus (the host `populateFromCharacter` born-state round's corpus feed) — against a real
// libSQL db. Proves: the card's authored prose renders as LABELED blocks with empty sections OMITTED (a thin
// card must not teach the model a scaffold of empty headings to fill), the room's OPENING line is the FIRST
// canon slot (never the newest — this is a born-state read, not a story read), a card unreadable under the
// room HOST resolves `null` (the verb then refuses rather than running the round on nothing), and a hostless
// room resolves `null` too (card ownership needs an owner, D18/D19).

import type { CharacterCard } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach } from "vitest";
import { createResolveRpgCardCorpus } from "../../../../../packages/server/src/domain/chat/verbs/resolve-rpg-card-corpus.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

/** A card double carrying only the fields the corpus renders; the rest of the (large) card shape is inert
 *  here, so a full construction would be noise. */
function card(over: { name: string; description?: string | null; personality?: string | null; scenario?: string | null }): CharacterCard {
  // FABRICATION-OK: the three prose fields ARE this op's whole input; a card gaining a field cannot change it.
  return { name: over.name, description: over.description ?? null, personality: over.personality ?? null, scenario: over.scenario ?? null } as CharacterCard;
}

test("renders the card's prose as labeled blocks + the room's OPENING line (the first slot, never the newest)", async () => {
  const chatId = await seedChat(db, "c");
  const hostId = await seedUser(db, castId<Handle>("host"));
  await seedParticipant(db, { chatId, key: "c_host", userId: hostId, role: "host" });
  const characterId = await seedCharacter(db, hostId, "Mara");
  await seedParticipant(db, { chatId, key: "c_mara", characterId });
  await seedMessage(db, chatId, 1, { role: "assistant", content: "You meet at the ford." });
  await seedMessage(db, chatId, 2, { role: "user", content: "a later beat that is NOT the opening" });

  const resolve = createResolveRpgCardCorpus(
    makeChatContext(db, { getCard: () => Promise.resolve(card({ name: "Mara", description: "A warden.", scenario: "The ford at dusk." })) }),
  );
  const corpus = await resolve(chatId, characterId);

  expect(corpus?.name).toBe("Mara");
  expect(corpus?.card).toBe("DESCRIPTION:\nA warden.\n\nSCENARIO:\nThe ford at dusk.");
  expect(corpus?.card).not.toContain("PERSONALITY"); // an empty section is OMITTED, never an empty heading
  expect(corpus?.opening).toBe("You meet at the ford.");
});

test("a room with no message yet yields an empty opening (the round runs on the card alone)", async () => {
  const chatId = await seedChat(db, "c2");
  const hostId = await seedUser(db, castId<Handle>("host2"));
  await seedParticipant(db, { chatId, key: "c2_host", userId: hostId, role: "host" });
  const characterId = await seedCharacter(db, hostId, "Vesna");
  await seedParticipant(db, { chatId, key: "c2_vesna", characterId });

  const resolve = createResolveRpgCardCorpus(makeChatContext(db, { getCard: () => Promise.resolve(card({ name: "Vesna", description: "A priest." })) }));
  const corpus = await resolve(chatId, characterId);

  expect(corpus).toEqual({ name: "Vesna", card: "DESCRIPTION:\nA priest.", opening: "" });
});

test("a card unreadable under the room host resolves NULL (the verb refuses rather than running on nothing)", async () => {
  const chatId = await seedChat(db, "c3");
  const hostId = await seedUser(db, castId<Handle>("host3"));
  await seedParticipant(db, { chatId, key: "c3_host", userId: hostId, role: "host" });
  const characterId = await seedCharacter(db, hostId, "Gone");
  await seedParticipant(db, { chatId, key: "c3_gone", characterId });

  // The card read (under the host's ownership) misses — a gone card / one the host does not own.
  const resolve = createResolveRpgCardCorpus(makeChatContext(db, { getCard: () => Promise.resolve(null) }));
  await expect(resolve(chatId, characterId)).resolves.toBeNull();
});

// ── #1448: the SEAT is the scope, not the host's library ─────────────────────────────────────────────
// This file's own header calls the input "one ROSTER character", and the rpg verb that consumes it is a
// per-actor round over the room's characters. Nothing enforced it: `characterId` arrives from
// `params.actorRef.characterId`, a wire parameter on `rpg.populateFromCharacter` validated only for
// `kind === "character"`, so a host could name ANY card in their library and pull its prose into this
// room's corpus (and, downstream, mint an `rpg_sheets` row for a character with no seat). The room's
// roster — not "whatever the host owns" — is the scope of a room-scoped read (D18: membership IS scope).
test("SECURITY: a host-OWNED character with NO present seat in this room resolves NULL", async () => {
  const chatId = await seedChat(db, "c5");
  const hostId = await seedUser(db, castId<Handle>("host5"));
  await seedParticipant(db, { chatId, key: "c5_host", userId: hostId, role: "host" });
  const seated = await seedCharacter(db, hostId, "Seated");
  const unseated = await seedCharacter(db, hostId, "Unseated");
  await seedParticipant(db, { chatId, key: "c5_seated", characterId: seated });

  const resolve = createResolveRpgCardCorpus(makeChatContext(db, { getCard: () => Promise.resolve(card({ name: "Any", description: "prose" })) }));

  // The control: the SEATED character still resolves through the same `getCard` double.
  await expect(resolve(chatId, seated)).resolves.not.toBeNull();
  await expect(resolve(chatId, unseated)).resolves.toBeNull();
});

test("SECURITY: a character whose seat has LEFT the room resolves NULL (the roster read is present-only)", async () => {
  const chatId = await seedChat(db, "c6");
  const hostId = await seedUser(db, castId<Handle>("host6"));
  await seedParticipant(db, { chatId, key: "c6_host", userId: hostId, role: "host" });
  const departed = await seedCharacter(db, hostId, "Departed");
  await seedParticipant(db, { chatId, key: "c6_departed", characterId: departed, leftSeq: 4 });

  const resolve = createResolveRpgCardCorpus(makeChatContext(db, { getCard: () => Promise.resolve(card({ name: "Any", description: "prose" })) }));

  await expect(resolve(chatId, departed)).resolves.toBeNull();
});

test("a HOSTLESS room resolves NULL — a card read needs an owner (D18/D19)", async () => {
  const chatId = await seedChat(db, "c4");
  const memberId = await seedUser(db, castId<Handle>("member4"));
  await seedParticipant(db, { chatId, key: "c4_member", userId: memberId, role: "member" });
  const characterId = await seedCharacter(db, memberId, "Orphan");

  // `getCard` would answer, but the op must never reach it without a host to own the read.
  const resolve = createResolveRpgCardCorpus(
    makeChatContext(db, {
      getCard: () => {
        throw new Error("getCard must not be reached without a room host");
      },
    }),
  );
  await expect(resolve(chatId, characterId)).resolves.toBeNull();
});
