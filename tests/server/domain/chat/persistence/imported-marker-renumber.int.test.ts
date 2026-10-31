// @subject packages/db/src/migrations/0005_renumber-imported-canon.sql
// @subject packages/server/src/domain/chat/assembly/shape.ts
// A launched bundle import keeps its carried compaction marker through the renumber, so the first row
// after the covered span reaches the model again.
import { chats, closeDb, createDb, runMigrations } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, plantLegacyZeroCanon, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { importedSeqs, textRoom } from "../scenario-physical.ts";

const MIGRATION = "0005_renumber-imported-canon";
const SUMMARY = "The traveller lit a lantern and the knight answered twice.";
const OPENING = "The lantern-lit opening line.";
const AFTER_MARKER = "The first line after the compacted span.";
const AFTER_MARKER_REPLY = "The knight's answer after the compacted span.";
const EXPORT_TO_IMPORT_MS = 60_000;

test("a 0-based bundle import with a carried marker shows the row after the marker once renumbered", async () => {
  // The bundle comes from a box on the shipped chain: the export reads every table at the current schema, which a
  // database cut before 0005 does not have once a later migration adds a column.
  await using source = await textRoom(["First answer.", "Second answer.", SUMMARY, AFTER_MARKER_REPLY]);
  const sourceChat = source.root.services.chat;
  await sourceChat.send({ principal: source.owner, chatId: source.chatId, content: OPENING });
  await sourceChat.send({ principal: source.owner, chatId: source.chatId, content: "A second question." });
  const compacted = await sourceChat.compact({ principal: source.owner, chatId: source.chatId });
  await sourceChat.send({ principal: source.owner, chatId: source.chatId, content: AFTER_MARKER });
  expect(compacted).toMatchObject({ summary: SUMMARY, compactedAtSeq: 4, updated: true });
  const exporter = source.root.app.portability.find((entity) => entity.kind === "chat");
  if (exporter === undefined) {
    throw new Error("the production graph has no chat portability descriptor");
  }
  const files: Parameters<typeof exporter.importFile>[1][] = [];
  for await (const file of exporter.exportAll(source.owner.userId)) {
    files.push(file);
  }
  const bundle = files.find((file) => file.filename.includes(source.chatId));
  if (bundle === undefined) {
    throw new Error("the chat export produced no bundle for the room");
  }

  await using previous = await migrationsBefore(MIGRATION);
  const db = await createDb(":memory:");
  try {
    await runMigrations(db, previous.path);
    await using h = await textRoom(["The reply after the renumber."], { server: { db } });
    const chat = h.root.services.chat;
    const descriptor = h.root.app.portability.find((entity) => entity.kind === "chat");
    if (descriptor === undefined) {
      throw new Error("the production graph has no chat portability descriptor");
    }
    h.root.clock.advance(EXPORT_TO_IMPORT_MS);
    const outcome = await descriptor.importFile(h.owner.userId, bundle);
    expect(outcome.ok).toBe(true);
    const [imported] = await db.select({ id: chats.id }).from(chats).where(eq(chats.importedFrom, bundle.filename));
    if (imported === undefined) {
      throw new Error("the bundle import landed no room");
    }
    // The launched import writer numbered the same canon from seq 0 and kept the source marker.
    await plantLegacyZeroCanon(h.root, imported.id);
    expect(await importedSeqs(h, imported.id)).toEqual([0, 1, 2, 3, 4, 5]);

    await runMigrations(db, SHIPPED_MIGRATIONS);

    expect(await importedSeqs(h, imported.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await db.select({ at: chats.compactedAtSeq }).from(chats).where(eq(chats.id, imported.id)))[0]?.at).toBe(4);
    const before = h.requests.length;
    expect((await chat.send({ principal: h.owner, chatId: imported.id, content: "And then?" })).aborted).toBe(false);
    const completions = h.requests.slice(before).filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
    expect(completions).toHaveLength(1);
    const wire = await completions[0]?.clone().text();
    expect(wire).toContain(SUMMARY);
    expect(wire).toContain(AFTER_MARKER);
    expect(wire).toContain(AFTER_MARKER_REPLY);
    expect(wire).not.toContain(OPENING);
  } finally {
    closeDb(db);
  }
});
