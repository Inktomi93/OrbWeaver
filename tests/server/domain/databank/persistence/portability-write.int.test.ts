// Mirror int-test for domain/databank/persistence/portability-write — the F1 fix over a real db. Databank
// was ABSENT from portability entirely, so a full-account backup silently lost the whole document library.
//
// The load-bearing properties, in the order they matter:
//   1. the CANON travels (`extractedText`) and lands on a FRESH box under a fresh id;
//   2. re-import is IDEMPOTENT via the carried `(ownerId, importHash)` — the dedup key must be on the wire
//      or every restore duplicates the library;
//   3. the two re-linkable scopes restore (global by value, characters BY HANDLE — ids are not preserved),
//      an unresolvable handle simply leaves the document unattached rather than failing;
//   4. a restored document ENQUEUES its ingest — nothing derived travels, so without it the document is
//      invisible to retrieval (a silently useless restore);
//   5. the owner gate holds on export, and a malformed file never throws.

import type { Db } from "@orb/db";
import { characterDocuments, documents, globalDocuments } from "@orb/db";
import type { DocumentId, Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { parseDocumentFile } from "@orb/server/kit/serde/databank";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import type { DatabankPortabilityContext } from "../../../../../packages/server/src/domain/databank/contract/portability.ts";
import {
  createExportDocument,
  createImportDocument,
  createListOwnedDocumentIds,
} from "../../../../../packages/server/src/domain/databank/persistence/portability-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedUser } from "../_support.ts";

const NOW = 1_700_000_000_000;

interface Enqueued {
  readonly documentId: DocumentId;
  readonly ownerId: UserId;
}

interface Harness {
  readonly ctx: DatabankPortabilityContext;
  readonly enqueued: Enqueued[];
}

function harness(db: Db): Harness {
  const enqueued: Enqueued[] = [];
  let n = 0;
  return {
    enqueued,
    ctx: {
      db,
      now: (): number => NOW,
      newDocumentId: (): DocumentId => {
        n += 1;
        return castId<DocumentId>(`document_new_${n}`);
      },
      enqueueIngest: async (args): Promise<{ readonly workloadId: WorkloadId }> => {
        enqueued.push(args);
        return await Promise.resolve({ workloadId: castId<WorkloadId>("workload_ingest") });
      },
    },
  };
}

interface SeedDocArgs {
  readonly id: string;
  readonly ownerId: UserId;
  readonly name: string;
  readonly text: string;
  readonly importHash: string;
}

async function seedDocument(db: Db, args: SeedDocArgs): Promise<DocumentId> {
  const id = castId<DocumentId>(args.id);
  await db.insert(documents).values({
    id,
    ownerId: args.ownerId,
    sourceAssetId: null,
    name: args.name,
    mime: "text/plain",
    origin: "text",
    sourceUrl: null,
    extractedText: args.text,
    importHash: args.importHash,
    byteSize: args.text.length,
    extractorVersion: "none",
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

describe("createListOwnedDocumentIds", () => {
  test("enumerates only the owner's documents (a bundle must never stream a stranger's canon)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    await seedDocument(db, { id: "document_mine", ownerId: owner, name: "Mine", text: "mine", importHash: "h_mine" });
    await seedDocument(db, { id: "document_theirs", ownerId: stranger, name: "Theirs", text: "theirs", importHash: "h_theirs" });

    expect(await createListOwnedDocumentIds({ db })({ ownerId: owner })).toEqual(["document_mine"]);
  });
});

describe("createExportDocument", () => {
  test("carries the canon, the dedup key, and both re-linkable scopes", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { id: "character_hero", name: "hero" });
    const documentId = await seedDocument(db, { id: "document_src", ownerId: owner, name: "Field Notes", text: "the canon", importHash: "h_src" });
    await db.insert(globalDocuments).values({ ownerId: owner, documentId });
    await db.insert(characterDocuments).values({ characterId: hero, documentId });

    const file = await createExportDocument({ db })({ ownerId: owner, documentId });
    if (file === null) {
      throw new Error("export returned null for an owned document");
    }
    expect(file.filename).toBe("field-notes-document_src.json");
    const parsed = parseDocumentFile(file.bytes);
    if (!parsed.ok) {
      throw new Error(`export bytes did not re-parse: ${parsed.reason}`);
    }
    expect(parsed.value.extractedText).toBe("the canon");
    expect(parsed.value.importHash).toBe("h_src");
    expect(parsed.value.global).toBe(true);
    expect(parsed.value.characterHandles).toEqual(["hero"]);
  });

  test("a foreign / absent document returns null (the leak-free owner gate)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const documentId = await seedDocument(db, { id: "document_theirs2", ownerId: stranger, name: "Theirs", text: "t", importHash: "h_t" });

    expect(await createExportDocument({ db })({ ownerId: owner, documentId })).toBeNull();
    expect(await createExportDocument({ db })({ ownerId: owner, documentId: castId<DocumentId>("document_absent") })).toBeNull();
  });
});

describe("createImportDocument", () => {
  /** Export from one owner, import into another — the real cross-box shape (fresh ids, handle re-link). */
  async function exportFrom(db: Db, ownerId: UserId, documentId: DocumentId): Promise<Uint8Array> {
    const file = await createExportDocument({ db })({ ownerId, documentId });
    if (file === null) {
      throw new Error("export returned null");
    }
    return file.bytes;
  }

  test("restores the canon under a fresh id, re-links the scopes, and ENQUEUES the ingest", async () => {
    const db = await freshDb();
    const source = await seedUser(db, { handle: castId<Handle>("source") });
    const target = await seedUser(db, { handle: castId<Handle>("target") });
    const sourceHero = await seedCharacter(db, source, { id: "character_source_hero", name: "hero" });
    const targetHero = await seedCharacter(db, target, { id: "character_target_hero", name: "hero" });
    const documentId = await seedDocument(db, { id: "document_travel", ownerId: source, name: "Travels", text: "the canon text", importHash: "h_travel" });
    await db.insert(globalDocuments).values({ ownerId: source, documentId });
    await db.insert(characterDocuments).values({ characterId: sourceHero, documentId });

    const h = harness(db);
    const outcome = await createImportDocument(h.ctx)({ ownerId: target, bytes: await exportFrom(db, source, documentId) });

    expect(outcome).toEqual({ ok: true, created: true });
    const restored = await db.select().from(documents).where(eq(documents.ownerId, target));
    expect(restored).toHaveLength(1);
    // A FRESH id — the canon travels, the identity does not.
    expect(restored[0]?.id).not.toBe(documentId);
    expect(restored[0]?.extractedText).toBe("the canon text");
    // The global scope rides in the file; the character scope re-links BY HANDLE to the TARGET's character.
    const restoredId = restored[0]?.id ?? castId<DocumentId>("none");
    expect(
      await db
        .select()
        .from(globalDocuments)
        .where(and(eq(globalDocuments.ownerId, target), eq(globalDocuments.documentId, restoredId))),
    ).toHaveLength(1);
    const links = await db.select().from(characterDocuments).where(eq(characterDocuments.documentId, restoredId));
    expect(links.map((r) => r.characterId)).toEqual([targetHero]);
    // Nothing derived travels — without this enqueue the restored document is invisible to retrieval.
    expect(h.enqueued).toEqual([{ documentId: restoredId, ownerId: target }]);
  });

  test("re-importing the SAME bundle writes zero duplicate rows (the carried importHash IS the dedup key)", async () => {
    const db = await freshDb();
    const source = await seedUser(db, { handle: castId<Handle>("source") });
    const target = await seedUser(db, { handle: castId<Handle>("target") });
    const documentId = await seedDocument(db, { id: "document_dup", ownerId: source, name: "Dup", text: "body", importHash: "h_dup" });
    const bytes = await exportFrom(db, source, documentId);

    const h = harness(db);
    const first = await createImportDocument(h.ctx)({ ownerId: target, bytes });
    const second = await createImportDocument(h.ctx)({ ownerId: target, bytes });

    expect(first).toEqual({ ok: true, created: true });
    expect(second).toEqual({ ok: true, created: false });
    expect(await db.select().from(documents).where(eq(documents.ownerId, target))).toHaveLength(1);
    // The dedup path must NOT re-enqueue an ingest for a document it did not write.
    expect(h.enqueued).toHaveLength(1);
  });

  test("an unresolvable character handle leaves the document UNATTACHED rather than failing the restore", async () => {
    const db = await freshDb();
    const source = await seedUser(db, { handle: castId<Handle>("source") });
    const target = await seedUser(db, { handle: castId<Handle>("target") });
    const sourceHero = await seedCharacter(db, source, { id: "character_source_hero", name: "hero" });
    const documentId = await seedDocument(db, { id: "document_orphan", ownerId: source, name: "Orphan", text: "body", importHash: "h_orphan" });
    await db.insert(characterDocuments).values({ characterId: sourceHero, documentId });

    // The target owns NO character with that handle.
    const outcome = await createImportDocument(harness(db).ctx)({ ownerId: target, bytes: await exportFrom(db, source, documentId) });

    expect(outcome).toEqual({ ok: true, created: true });
    const restored = await db.select().from(documents).where(eq(documents.ownerId, target));
    expect(restored).toHaveLength(1);
    expect(
      await db
        .select()
        .from(characterDocuments)
        .where(eq(characterDocuments.documentId, restored[0]?.id ?? castId<DocumentId>("none"))),
    ).toEqual([]);
  });

  test("a malformed file NEVER throws — it returns the operator-facing reason the import report renders", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const h = harness(db);

    const garbage = await createImportDocument(h.ctx)({ ownerId: owner, bytes: new TextEncoder().encode("{not json") });
    expect(garbage.ok).toBe(false);
    expect(garbage.ok ? "" : garbage.error).toContain("not JSON");
    expect(await db.select().from(documents).where(eq(documents.ownerId, owner))).toHaveLength(0);
    expect(h.enqueued).toEqual([]);
  });
});
