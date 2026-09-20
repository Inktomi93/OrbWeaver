// verb: attachToChat — attach a caller-OWNED document to a chat room, HOST-gated. Load-bearing: the host
// authority (a non-host attach rejects, no junction row); the ownership gate (a FOREIGN document never
// attaches even for the host); idempotent re-attach; and the ROOM FAN (#2471) — the co-member plane a
// single-principal test structurally cannot see.

import { chatDocuments } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedChat, seedChatHost, seedUser } from "../../_support.ts";

test("host attaches an owned document to the room; re-attach idempotent", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db); // default ensureChatHost resolves (host)
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId });
  await h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId }); // idempotent
  const rows = await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, document.id));
  expect(rows).toEqual([{ chatId, documentId: document.id }]);
});

test("a non-host attach is rejected by the injected host guard — no junction row", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { ensureChatHost: () => Promise.reject(new Error("not host")) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId })).rejects.toThrow("not host");
  expect(await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, document.id))).toHaveLength(0);
});

test("a foreign document NEVER attaches to a chat even for the host (cross-tenant)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db); // host guard resolves
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const attacker = await seedUser(db, { handle: castId<Handle>("attacker") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.attachToChat({ principal: principalFor(attacker), documentId: document.id, chatId })).rejects.toBeInstanceOf(DocumentNotFoundError);
  expect(await db.select().from(chatDocuments).where(eq(chatDocuments.documentId, document.id))).toHaveLength(0);
});

// ── #2471 — THE ROOM PLANE ─────────────────────────────────────────────────────────────
// The case a SINGLE-PRINCIPAL test structurally cannot see, which is why the defect survived: the
// co-member's server state was always correct the instant the junction row landed; what was missing was
// anything telling their device to re-read. `databankChanged` reaches ONE user's channel by construction,
// so it repainted the host and nobody else. The room fan is the fix (owner ruling 2026-09-20 closed bridge
// fork F-E). `h.roomFans` is the REAL `entry/compose/room-reach.ts` reach run against the real db — only the
// terminal publish is recorded — and every rack receipt below is taken AS THE CO-MEMBER principal.
test("#2471 a host's attach fans the ROOM, and the co-member's own read carries the document", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host);
  await seedChatHost(db, chatId, member, "member");
  const { document } = await h.service.createFromText({ principal: principalFor(host), name: "d.md", text: "canon" });
  h.userEvents.length = 0; // drop the create's own fan — this asserts what the ATTACH announces

  await h.service.attachToChat({ principal: principalFor(host), documentId: document.id, chatId });

  // THE ROOM heard it — once, for this room, id-free (the bridge carries no payload).
  expect(h.roomFans).toEqual([{ type: "roomEntityChanged", chatId, entity: "databank" }]);
  // ...the host's own bank still announces per-person (both planes; neither replaces the other)...
  expect(h.userEvents).toEqual([{ userId: host, event: { type: "databankChanged", documentId: document.id } }]);
  // ...and the read that fan tells the co-member to re-issue returns the document, AS THE CO-MEMBER.
  const asMember = await h.service.listActiveForChat({ principal: principalFor(member), chatId });
  expect(asMember.map((row) => row.id)).toEqual([document.id]);
});

test("#2471 a host's detach fans the same room, and the co-member's read drops the document", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const member = await seedUser(db, { handle: castId<Handle>("member") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host);
  await seedChatHost(db, chatId, member, "member");
  const { document } = await h.service.createFromText({ principal: principalFor(host), name: "d.md", text: "canon" });
  await h.service.attachToChat({ principal: principalFor(host), documentId: document.id, chatId });
  h.roomFans.length = 0;

  await h.service.detachFromChat({ principal: principalFor(host), documentId: document.id, chatId });

  expect(h.roomFans).toEqual([{ type: "roomEntityChanged", chatId, entity: "databank" }]);
  expect(await h.service.listActiveForChat({ principal: principalFor(member), chatId })).toEqual([]);

  // AN IDEMPOTENT DETACH FANS NOTHING — the guard that keeps a no-op toggle from storming every member
  // device (`invalidateQueries` cancels and restarts an in-flight fetch; that storm is what the narrow
  // bridge member exists to avoid).
  h.roomFans.length = 0;
  await h.service.detachFromChat({ principal: principalFor(host), documentId: document.id, chatId });
  expect(h.roomFans).toEqual([]);
});

test("#2471 an idempotent RE-attach fans nothing — only a real junction write announces", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const host = await seedUser(db, { handle: castId<Handle>("host") });
  const chatId = await seedChat(db, "chat_room");
  await seedChatHost(db, chatId, host);
  const { document } = await h.service.createFromText({ principal: principalFor(host), name: "d.md", text: "canon" });

  await h.service.attachToChat({ principal: principalFor(host), documentId: document.id, chatId });
  h.roomFans.length = 0;
  await h.service.attachToChat({ principal: principalFor(host), documentId: document.id, chatId });

  expect(h.roomFans).toEqual([]);
});

test("#2471 a REFUSED attach fans nothing — the host guard rejects before any announcement", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { ensureChatHost: () => Promise.reject(new Error("not host")) });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const chatId = await seedChat(db, "chat_room");
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "d.md", text: "canon" });

  await expect(h.service.attachToChat({ principal: principalFor(owner), documentId: document.id, chatId })).rejects.toThrow("not host");

  expect(h.roomFans).toEqual([]);
});
