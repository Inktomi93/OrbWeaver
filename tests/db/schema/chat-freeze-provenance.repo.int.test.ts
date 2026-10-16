// @subject packages/db/src/schema/chat.ts
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertReferentialIntegrity, closeDb, createDb, messages, messageVariants, runMigrations } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { runBootMigrations } from "@orb/server/entry/boot";
import { SHIPPED_MIGRATIONS } from "@orb/testkit/node/db.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq, sql } from "drizzle-orm";

const MIGRATION = "0004_freeze-provenance";
const RECORD = [{ name: "roll", args: "1d1", value: "1" }];

async function precedingChain(): Promise<AsyncDisposable & { readonly path: string }> {
  const path = await mkdtemp(join(tmpdir(), "freeze-provenance-chain-"));
  try {
    await cp(SHIPPED_MIGRATIONS, path, { recursive: true });
    const journalPath = join(path, "meta", "_journal.json");
    const journal = jsonValueSchema.parse(JSON.parse(await readFile(journalPath, "utf8")));
    if (journal === null || typeof journal !== "object" || Array.isArray(journal) || !Array.isArray(journal["entries"])) {
      throw new Error("shipped migration journal has no entries");
    }
    const entries = journal["entries"];
    const index = entries.findIndex((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry) && entry["tag"] === MIGRATION);
    if (index < 1) {
      throw new Error("freeze provenance migration has no preceding chain");
    }
    await writeFile(journalPath, JSON.stringify({ ...journal, entries: entries.slice(0, index) }));
    return { path, [Symbol.asyncDispose]: () => rm(path, { recursive: true, force: true }) };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}

test("the shipped database rejects incoherent provenance on insert, update and upsert and rolls back the batch", async () => {
  const db = await createDb(":memory:");
  try {
    await runMigrations(db, SHIPPED_MIGRATIONS);
    const row = await seedMessage(db, { content: "Baked 1" });
    for (const invalid of ["[]", "{}", "null", "not json"]) {
      await expect(db.run(sql`update message_variants set macro_freezes=${invalid} where id=${row.variantId}`)).rejects.toThrow();
    }
    await expect(db.update(messageVariants).set({ rawContent: row.content }).where(eq(messageVariants.id, row.variantId))).rejects.toThrow();
    await expect(
      db.run(
        sql`insert into message_variants(id,message_id,idx,content,raw_content) values(${mintTypeId(ID_PREFIX.messageVariant)},${row.id},1,${"same"},${"same"})`,
      ),
    ).rejects.toThrow();
    const before = await db.select().from(messageVariants);
    await expect(
      db.batch([
        db.update(messageVariants).set({ reasoning: "must roll back" }).where(eq(messageVariants.id, row.variantId)),
        db
          .insert(messageVariants)
          .values({ id: row.variantId, messageId: row.id, idx: 0, content: "new" })
          .onConflictDoUpdate({
            target: messageVariants.id,
            set: { content: "same", rawContent: "same", macroFreezes: RECORD },
          }),
      ]),
    ).rejects.toThrow();
    expect(await db.select().from(messageVariants)).toEqual(before);
    await db.update(messageVariants).set({ rawContent: "Regex-only original", macroFreezes: null }).where(eq(messageVariants.id, row.variantId));
    expect(await db.select({ raw: messageVariants.rawContent, freezes: messageVariants.macroFreezes }).from(messageVariants)).toEqual([
      { raw: "Regex-only original", freezes: null },
    ]);
    await db.update(messageVariants).set({ rawContent: "Baked {{roll::1d1}}", macroFreezes: RECORD }).where(eq(messageVariants.id, row.variantId));
    await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  } finally {
    closeDb(db);
  }
});

test("the forward migration preserves coherent provenance and circular message selection byte-for-byte", async () => {
  await using previous = await precedingChain();
  const db = await createDb(":memory:");
  try {
    await runMigrations(db, previous.path);
    const row = await seedMessage(db, { content: "Baked 1" });
    await db.update(messageVariants).set({ rawContent: "Baked {{roll::1d1}}", macroFreezes: RECORD }).where(eq(messageVariants.id, row.variantId));
    const storedRecord = '[\n { "name": "roll", "args": "1d1", "value": "1" }\n]';
    await db.run(sql`update message_variants set macro_freezes=${storedRecord} where id=${row.variantId}`);
    const regex = await seedMessage(db, { chatId: row.chatId, seq: 2, content: "Regex result" });
    await db.update(messageVariants).set({ rawContent: "Regex original" }).where(eq(messageVariants.id, regex.variantId));
    await seedMessage(db, { chatId: row.chatId, seq: 3, content: "No provenance" });
    const variants = await db.select().from(messageVariants).orderBy(messageVariants.idx, messageVariants.id);
    const stored = await db.all(sql`select * from message_variants order by id`);
    const slots = await db.select().from(messages).orderBy(messages.seq);
    await runMigrations(db, SHIPPED_MIGRATIONS);
    expect(await db.select().from(messageVariants).orderBy(messageVariants.idx, messageVariants.id)).toEqual(variants);
    expect(await db.all(sql`select * from message_variants order by id`)).toEqual(stored);
    expect(await db.select().from(messages).orderBy(messages.seq)).toEqual(slots);
    await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
    await runMigrations(db, SHIPPED_MIGRATIONS);
    expect(await db.select().from(messageVariants).orderBy(messageVariants.idx, messageVariants.id)).toEqual(variants);
  } finally {
    closeDb(db);
  }
});

test("an invalid existing row refuses the forward migration atomically without cleanup or advancing its journal", async () => {
  await using previous = await precedingChain();
  const db = await createDb(":memory:");
  try {
    await runMigrations(db, previous.path);
    const row = await seedMessage(db, { content: "same" });
    await db.update(messageVariants).set({ rawContent: "same" }).where(eq(messageVariants.id, row.variantId));
    const before = await db.select().from(messageVariants);
    const journal = await db.all(sql`select * from __drizzle_migrations order by id`);
    await expect(runMigrations(db, SHIPPED_MIGRATIONS)).rejects.toThrow();
    expect(await db.select().from(messageVariants)).toEqual(before);
    expect(await db.all(sql`select * from __drizzle_migrations order by id`)).toEqual(journal);
    expect(await db.get(sql`pragma foreign_keys`)).toEqual({ ["foreign_keys"]: 1 });
    await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  } finally {
    closeDb(db);
  }
});

test("production boot backs up a copied file database before the provenance rebuild and retains its canon", async ({ importStagingDir }) => {
  await using previous = await precedingChain();
  const sourcePath = join(importStagingDir, "source.db");
  const source = await createDb(pathToFileURL(sourcePath).href);
  try {
    await runMigrations(source, previous.path);
    const row = await seedMessage(source, { content: "Baked 1" });
    await source.update(messageVariants).set({ rawContent: "Baked {{roll::1d1}}", macroFreezes: RECORD }).where(eq(messageVariants.id, row.variantId));
  } finally {
    closeDb(source);
  }
  const copyPath = join(importStagingDir, "copy.db");
  await cp(sourcePath, copyPath);
  const databaseUrl = pathToFileURL(copyPath).href;
  const db = await createDb(databaseUrl);
  try {
    const before = await db.select().from(messageVariants);
    const backupDir = join(importStagingDir, "backups");
    await runBootMigrations({ db, databaseUrl, backupDir, migrationsFolder: SHIPPED_MIGRATIONS, launched: true });
    expect(await db.select().from(messageVariants)).toEqual(before);
    await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
    const backups = await readdir(backupDir);
    expect(backups).toHaveLength(1);
    const backup = backups[0];
    if (backup === undefined) {
      throw new Error("production boot omitted its required pre-migration backup");
    }
    const saved = await createDb(pathToFileURL(join(backupDir, backup)).href);
    try {
      expect(await saved.select().from(messageVariants)).toEqual(before);
      // The backup precedes the new CHECK, rather than snapshotting the already-migrated copy.
      await saved.run(sql`update message_variants set raw_content=content`);
      await expect(db.run(sql`update message_variants set raw_content=content`)).rejects.toThrow();
    } finally {
      closeDb(saved);
    }
  } finally {
    closeDb(db);
  }
});
