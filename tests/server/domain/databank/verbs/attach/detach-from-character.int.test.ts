// verb: detachFromCharacter (DB8) — the character-ownership gate runs BEFORE the characterId-keyed delete
// (the junction row carries no ownerId, so the gate IS the cross-tenant chokepoint). Load-bearing here: the
// gate-refused foreign detach leaves the owner's REAL binding intact (non-vacuous — an ungated delete would
// match and remove it). The attach/detach round-trip + idempotency live in the sibling
// attach-to-character.int.test.ts (one flow, one file); this mirror pins the detach gate specifically.

import { characterDocuments } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DatabankCharacterNotFoundError } from "@orb/server/domain/databank";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedCharacter, seedUser } from "../../_support.ts";

test("a stranger's detach aimed at a foreign character's REAL binding is refused and the row survives", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const characterId = await seedCharacter(db, owner, { id: "character_owned" });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  await h.service.attachToCharacter({ principal: principalFor(owner), documentId: document.id, characterId });

  await expect(h.service.detachFromCharacter({ principal: principalFor(stranger), documentId: document.id, characterId })).rejects.toBeInstanceOf(
    DatabankCharacterNotFoundError,
  );
  // The binding SURVIVED the refused detach — an ungated delete would have matched (characterId, documentId).
  expect(await db.select().from(characterDocuments).where(eq(characterDocuments.characterId, characterId))).toEqual([{ characterId, documentId: document.id }]);

  // The owner's own detach still works after the refused attempt (no phantom state).
  await h.service.detachFromCharacter({ principal: principalFor(owner), documentId: document.id, characterId });
  expect(await db.select().from(characterDocuments).where(eq(characterDocuments.characterId, characterId))).toHaveLength(0);
});
