// verb: rename — mutable display metadata only, bumps updatedAt, touches nothing derived. A foreign/missing
// id throws DocumentNotFoundError (the ownership check folds into the UPDATE … WHERE owner_id RETURNING).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedChat, seedChatHost, seedUser } from "../_support.ts";

test("renames an owned document and bumps updatedAt", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "old.md", text: "canon" });
  h.advance(500);

  const renamed = await h.service.rename({ principal: principalFor(owner), id: document.id, name: "new.md" });
  expect(renamed.name).toBe("new.md");
  expect(renamed.updatedAt).toBeGreaterThan(document.updatedAt);
  // The create + the rename each announced on the per-user freshness plane (event-bus coverage survey H3):
  // before `databankChanged` the write tier named its own reads and no SECOND tab ever reconciled.
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
    { userId: owner, event: { type: "databankChanged", documentId: document.id } },
  ]);
});

test("a non-owner's rename throws DocumentNotFoundError", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "old.md", text: "canon" });

  await expect(h.service.rename({ principal: principalFor(other), id: document.id, name: "hijack.md" })).rejects.toBeInstanceOf(DocumentNotFoundError);
  // A REFUSED write announces nothing — the emit sits after the RETURNING that proved ownership, so only the
  // create's event stands. (And it went to the OWNER's channel, never the foreign caller's.)
  expect(h.userEvents).toEqual([{ userId: owner, event: { type: "databankChanged", documentId: document.id } }]);
});

// ── #2471 — the RENAME half of the room-freshness gap (the one bridge design §8 named) ──────────────
// The rack renders the document's NAME, so a rename is member-visible in every room that credits the
// document — and it announced on the per-person `databankChanged` only, so co-members read the old title
// until they reloaded. Unlike attach/detach the verb holds no chatId: the reach is resolved from the
// document through the D85 junctions, which all survive a rename. `h.roomFans` is the REAL reach SQL.
test("#2471 a rename fans every room crediting the document — chat scope and global scope, deduped", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const attached = await seedChat(db, "chat_attached");
  const global = await seedChat(db, "chat_global");
  const unrelated = await seedChat(db, "chat_unrelated");
  await seedChatHost(db, attached, owner);
  await seedChatHost(db, attached, member, "member");
  await seedChatHost(db, global, owner);
  await seedChatHost(db, unrelated, member);
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "old.md", text: "canon" });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId: attached });
  await h.service.attachGlobal({ principal: principalFor(owner), documentId: document.id });
  h.roomFans.length = 0;

  await h.service.rename({ principal: principalFor(owner), id: document.id, name: "new.md" });

  // BOTH crediting rooms, ONCE each (the chat-attached room is also the owner's, so it is credited twice by
  // the union and deduped by the fan), and the room the owner does not sit in is NOT reached.
  expect(h.roomFans.map((fan) => fan.chatId).toSorted((a, b) => a.localeCompare(b))).toEqual([attached, global].toSorted((a, b) => a.localeCompare(b)));
  // The co-member's own read carries the NEW name — receipt taken as the MEMBER, not the owner.
  const asMember = await h.service.listActiveForChat({ principal: principalFor(member), chatId: attached });
  expect(asMember.map((row) => row.name)).toEqual(["new.md"]);
});

test("#2471 a REFUSED rename (foreign document) fans nothing", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const attacker = await seedUser(db, { handle: castId<Handle>("attacker") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, owner);
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "old.md", text: "canon" });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });
  h.roomFans.length = 0;

  await expect(h.service.rename({ principal: principalFor(attacker), id: document.id, name: "pwned.md" })).rejects.toBeInstanceOf(DocumentNotFoundError);

  expect(h.roomFans).toEqual([]);
});
