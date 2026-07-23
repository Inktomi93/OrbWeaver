// verb: attachToCharacter / detachFromCharacter (DB8) — attach a caller-OWNED document to a caller-OWNED
// character. Load-bearing: BOTH-side ownership (a foreign document AND a foreign character each collapse to a
// leak-free NOT_FOUND, no junction row / no cross-tenant delete); idempotent re-attach + idempotent detach;
// the reverse `listAttachments` view surfaces the character binding.

import { characterDocuments } from "@orb/db";
import { DatabankCharacterNotFoundError, DocumentNotFoundError } from "@orb/server/domain/databank";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedCharacter, seedUser } from "../../_support.ts";

test("owner attaches an owned document to an owned character; re-attach idempotent; detach removes it", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const characterId = await seedCharacter(db, owner, { id: "character_owned" });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await h.service.attachToCharacter({ principal: principalFor(owner), documentId: document.id, characterId });
  await h.service.attachToCharacter({ principal: principalFor(owner), documentId: document.id, characterId }); // idempotent
  expect(await db.select().from(characterDocuments).where(eq(characterDocuments.documentId, document.id))).toEqual([{ characterId, documentId: document.id }]);

  await h.service.detachFromCharacter({ principal: principalFor(owner), documentId: document.id, characterId });
  await h.service.detachFromCharacter({ principal: principalFor(owner), documentId: document.id, characterId }); // idempotent no-op
  expect(await db.select().from(characterDocuments).where(eq(characterDocuments.documentId, document.id))).toHaveLength(0);
});

test("a foreign DOCUMENT never attaches to an owned character (cross-tenant)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const attacker = await seedUser(db, { handle: "attacker" });
  const attackerCharacter = await seedCharacter(db, attacker, { id: "character_attacker" });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  // The attacker owns the character but NOT the document → DocumentNotFoundError, no junction row.
  await expect(
    h.service.attachToCharacter({ principal: principalFor(attacker), documentId: document.id, characterId: attackerCharacter }),
  ).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await db.select().from(characterDocuments).where(eq(characterDocuments.documentId, document.id))).toHaveLength(0);
});

test("a foreign CHARACTER never receives a document, even the caller's own (cross-tenant)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const attacker = await seedUser(db, { handle: "attacker" });
  const ownerCharacter = await seedCharacter(db, owner, { id: "character_owned" });
  const { document } = await h.service.createFromText({ principal: principalFor(attacker), name: "d.md", text: "attacker canon" });
  // A REAL owner binding must exist for the detach arm to have teeth: the junction is keyed on characterId
  // alone, so an UNGATED delete would reach this row — the arm below proves the ownership gate protects it.
  const { document: ownerDoc } = await h.service.createFromText({ principal: principalFor(owner), name: "o.md", text: "owner canon" });
  await h.service.attachToCharacter({ principal: principalFor(owner), documentId: ownerDoc.id, characterId: ownerCharacter });

  // The attacker owns the document but targets the OWNER's character → leak-free NOT_FOUND, no junction row.
  await expect(h.service.attachToCharacter({ principal: principalFor(attacker), documentId: document.id, characterId: ownerCharacter })).rejects.toBeInstanceOf(
    DatabankCharacterNotFoundError,
  );
  // detach is gated identically — a stranger can't remove a binding on a foreign character. The attacker
  // aims at the OWNER's real binding (their own doc id would be refused one gate earlier, at loadOwnedMeta).
  await expect(
    h.service.detachFromCharacter({ principal: principalFor(attacker), documentId: ownerDoc.id, characterId: ownerCharacter }),
  ).rejects.toBeInstanceOf(DatabankCharacterNotFoundError);
  // The owner's binding SURVIVES the refused foreign detach (non-vacuous: an ungated delete would remove it),
  // and the attacker's refused attach added nothing beside it.
  expect(await db.select().from(characterDocuments).where(eq(characterDocuments.characterId, ownerCharacter))).toEqual([
    { characterId: ownerCharacter, documentId: ownerDoc.id },
  ]);
});

test("listAttachments surfaces the character binding (reverse view)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const characterId = await seedCharacter(db, owner, { id: "character_owned" });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  const before = await h.service.listAttachments({ principal: principalFor(owner), id: document.id });
  expect(before.characterIds).toEqual([]);

  await h.service.attachToCharacter({ principal: principalFor(owner), documentId: document.id, characterId });
  const after = await h.service.listAttachments({ principal: principalFor(owner), id: document.id });
  expect(after).toEqual({ global: false, chatIds: [], characterIds: [characterId] });
});
