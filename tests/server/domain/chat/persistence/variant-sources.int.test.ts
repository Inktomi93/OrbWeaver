// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// @subject packages/contracts/src/chat/messages.ts
// @subject packages/db/src/schema/chat.ts
// The last hop a citation takes is the column. It needs no DDL: `message_variants.metadata` is typed JSON whose
// shape already declares `sources`, so the production canon writer stores the list and `parseVariantMetadata`
// hands it back. The composed provider speaks the openai-compatible wire, which emits no source parts, so this
// hop is proven through the real writer + column + read seam rather than a live turn.
import { parseVariantMetadata } from "@orb/contracts/chat";
import { createDb, messageVariants, runMigrations } from "@orb/db";
import { batchMany } from "@orb/db/query";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedMessageRow } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";
import { appendVariantStatements } from "#server/domain/chat/persistence/canon-write.ts";

// One entry with every field the wire can supply, one with none of the optional ones: the round trip must keep the
// absent keys absent, not materialize `title: undefined` or an `endChars` of 0.
const SOURCES = [
  { url: "https://example.test/one", title: "One", atChars: 6, endChars: 10, citedText: "the passage" },
  { url: "https://example.test/two", atChars: 0 },
];

test("the canon writer stores a turn's sources in the variant sidecar and the parse seam returns them", async () => {
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, SHIPPED_MIGRATIONS);
  const source = createIdSource(createSeededIds().next);
  const slot = await seedMessageRow(db, { content: "Alpha beta." }, source);
  const variantId = source.typeId(ID_PREFIX.messageVariant);
  await db.batch(
    batchMany(
      appendVariantStatements(db, {
        messageId: slot.id,
        variantId,
        idx: 1,
        now: slot.createdAt,
        variant: { content: "Alpha beta.", metadata: { sources: SOURCES } },
      }),
    ),
  );
  const row = await db.select({ metadata: messageVariants.metadata }).from(messageVariants).where(eq(messageVariants.id, variantId)).get();
  if (row === undefined) {
    throw new Error("the canon writer left no variant row");
  }
  // The raw blob proves the write reached the column; the parse seam proves the READ side agrees on the shape.
  expect(row.metadata).toEqual({ sources: SOURCES });
  expect(parseVariantMetadata(row.metadata).sources).toEqual(SOURCES);
});
