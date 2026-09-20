// verb: attachGlobal — mark an owned document global, idempotently. Load-bearing: the ownership gate — a
// FOREIGN document id must NEVER attach (throws DocumentNotFoundError, no junction row).

import { globalDocuments } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedChat, seedChatHost, seedUser } from "../../_support.ts";

test("marks the owned document global; re-attach is idempotent", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id });
  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id }); // idempotent
  const rows = await db.select().from(globalDocuments).where(eq(globalDocuments.documentId, document.id));
  expect(rows).toEqual([{ ownerId: owner, documentId: document.id }]);
  // TWO events, not three: the create and the FIRST attach announced; the idempotent re-attach returned
  // before any write and announced nothing (event-bus coverage survey H3). A no-op toggle that told every
  // device to refetch would be the storm the coarse member exists to avoid.
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
  ]);
});

test("a foreign document id NEVER attaches — throws DocumentNotFoundError, no junction row (cross-tenant)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const attacker = await seedUser(db, { handle: castId<Handle>("attacker") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.attachGlobal({ principal: principalFor(attacker), documentId: document.id })).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await db.select().from(globalDocuments).where(eq(globalDocuments.documentId, document.id))).toHaveLength(0);
  // The cross-tenant refusal announces on NO channel — not the attacker's (nothing of theirs changed) and
  // not the owner's (nothing of theirs changed either). Only the create's event stands.
  expect(h.userEvents).toEqual([{ userId: owner, event: { type: "databankChanged", documentId: document.id } }]);
});

// ── #2471 — the GLOBAL-scope room fan ─────────────────────────────────────────────────
// D85 credits EVERY PRESENT HUMAN MEMBER's global documents to the room — not just the host's — so marking
// a document global changes what every co-member's rack shows in every room its owner is seated in. The
// reach is keyed on the OWNER (`chat_participants`, which this write does not touch), which is what lets
// the detach twin resolve the same set after its junction row is gone.
test("#2471 a global attach/detach fans every room its OWNER is seated in, not the rooms they merely host", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const hosted = await seedChat(db, "chat_hosted");
  const guest = await seedChat(db, "chat_guest");
  const absent = await seedChat(db, "chat_absent");
  await seedChatHost(db, hosted, owner);
  await seedChatHost(db, guest, other);
  await seedChatHost(db, guest, owner, "member"); // the owner sits as a MEMBER here — still credits D85
  await seedChatHost(db, absent, other);
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });
  h.roomFans.length = 0;

  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id });
  expect(h.roomFans.map((fan) => fan.chatId).toSorted((a, b) => a.localeCompare(b))).toEqual([guest, hosted].toSorted((a, b) => a.localeCompare(b)));
  // The room the owner is NOT seated in never hears it, and the co-member of the guest room reads it.
  const asOther = await h.service.listActiveForChat({ principal: principalFor(other), chatId: guest });
  expect(asOther.map((row) => row.id)).toEqual([document.id]);

  // The DETACH resolves the SAME set after its junction row is gone — the key is the owner, not the row.
  h.roomFans.length = 0;
  await h.service.detachGlobal({ principal: principalFor(owner), documentId: document.id });
  expect(h.roomFans.map((fan) => fan.chatId).toSorted((a, b) => a.localeCompare(b))).toEqual([guest, hosted].toSorted((a, b) => a.localeCompare(b)));

  // An idempotent re-detach is a no-op and announces nothing.
  h.roomFans.length = 0;
  await h.service.detachGlobal({ principal: principalFor(owner), documentId: document.id });
  expect(h.roomFans).toEqual([]);
});
