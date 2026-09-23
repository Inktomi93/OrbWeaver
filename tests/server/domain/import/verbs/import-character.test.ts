// Mirror test for domain/import/verbs/import-character — the card-import verb (test-presence). Asserts the
// end-to-end card path over the injected fakes: a real ST card → flatten + provenance into the create op,
// the PNG-card avatar store, the bare-JSON no-avatar path, the importHash dedup oracle, the raw card-tag
// carry (no extraction-side dedupe), and the unreadable throw. EVERY INVARIANT SHIPS ITS ENFORCER.

import type { CharacterHandle, CharacterId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { createImportService, ImportCardError } from "@orb/server/domain/import";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness } from "../_support.ts";

const V3_CARD = {
  spec: "chara_card_v3",
  spec_version: "3.0",
  data: {
    name: "Aria",
    description: "A wandering bard.",
    personality: "curious",
    scenario: "a tavern",
    first_mes: "Hello there!",
    alternate_greetings: ["Well met."],
    mes_example: "",
    system_prompt: "",
    post_history_instructions: "",
    creator: "alex",
    creator_notes: "",
    character_version: "1.0",
    tags: ["bard", "fantasy"],
    extensions: {},
  },
};
const V3_JSON = JSON.stringify(V3_CARD);
// Raw ST wire TEXT (snake_case by spec) — the format IS the fixture, and a string carries the wire's own
// spelling without a naming-convention suppression.
const CARD_WITH_BOOK_JSON =
  '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Aria","description":"a bard","character_book":{"name":"Aria\'s World","entries":[{"keys":["kingdom"],"content":"A realm of dusk.","comment":"The Kingdom","insertion_order":10}]}}}';
const encoder = new TextEncoder();
const SHA256_HEX = /^[0-9a-f]{64}$/u;

// A minimal valid PNG (signature + zero-length IEND) to embed the card into via the kit codec.
const MINIMAL_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

describe("importCharacter", () => {
  test("a real ST PNG card → create with flattened card + provenance + the stored avatar", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const png = writeCardChunk(MINIMAL_PNG, V3_JSON);

    const result = await svc.importCharacter({ card: { bytes: png, filename: "Aria.png" } });

    expect(result.created).toBe(true);
    // the PNG card IS its own avatar — stored once, the id rides onto the create input.
    expect(h.stores).toHaveLength(1);
    expect(h.stores[0]?.mime).toBe("image/png");
    expect(h.creates).toHaveLength(1);
    const call = h.creates[0];
    if (call === undefined) {
      throw new Error("expected a recorded create call");
    }
    expect(call.ownerId).toBe(h.ownerId);
    expect(call.input.name).toBe("Aria");
    expect(call.input.handle).toBe("aria");
    expect(call.input.greetings).toEqual([{ text: "Hello there!" }, { text: "Well met." }]);
    expect(call.input.avatarAssetId).toBe(h.storedAssetId);
    expect(call.importedFrom).toBe("Aria.png");
    expect(call.importHash).toBe(result.importHash);
    expect(call.importHash).toMatch(SHA256_HEX);
    // the author-shipped card tags are carried (the injected op binds source:'card', status:'pending').
    expect(h.tagAttaches.map((t) => t.tagName)).toEqual(["bard", "fantasy"]);
    for (const attach of h.tagAttaches) {
      expect(attach.ownerId).toBe(h.ownerId);
      expect(attach.characterId).toBe(result.characterId);
    }
  });

  test("forwards RAW card tags to the chokepoint (no extraction-side dedupe/normalize)", async () => {
    // Extraction is now dumb: it passes every string through verbatim — including a case-variant and a
    // whitespace-padded name. The tag resolve-or-create chokepoint (normalizeTagName + the functional unique)
    // is the ONE place that collapses "Female"/"female" and trims " NSFW " — proven against a real db in the
    // tag domain's int test. Here we pin that the import loop does NOT pre-dedupe.
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const card = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Dup", description: "d", tags: ["Female", "female", " NSFW "] },
    });

    await svc.importCharacter({ card: { bytes: encoder.encode(card), filename: "dup.json" } });

    expect(h.tagAttaches.map((t) => t.tagName)).toEqual(["Female", "female", " NSFW "]);
  });

  test("an embedded character_book is extracted + handed to the injected importLorebook op (W1)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const withBook = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Aria",
        description: "a bard",
        character_book: {
          name: "Aria's World",
          entries: [
            {
              keys: ["kingdom"],
              content: "A realm of dusk.",
              comment: "The Kingdom",
              constant: true,
              insertion_order: 10,
            },
          ],
        },
      },
    });

    const result = await svc.importCharacter({
      card: { bytes: encoder.encode(withBook), filename: "aria.json" },
    });

    expect(h.lorebooks).toHaveLength(1);
    const call = h.lorebooks[0];
    if (call === undefined) {
      throw new Error("expected a recorded lorebook call");
    }
    expect(call.ownerId).toBe(h.ownerId);
    expect(call.characterId).toBe(result.characterId);
    expect(call.book.name).toBe("Aria's World");
    expect(call.book.entries).toHaveLength(1);
    const entry = call.book.entries[0];
    expect(entry?.title).toBe("The Kingdom"); // ST `comment` → title
    expect(entry?.content).toBe("A realm of dusk.");
    expect(entry?.keys).toEqual(["kingdom"]);
    expect(entry?.priority).toBe(10); // ST `insertion_order` → priority
    // `constant:true` → `scopeMode:'always'` (the load-bearing runtime-scope derivation, #kit/serde/card).
    expect(entry?.metadata?.["scopeMode"]).toBe("always");
  });

  test("a card with no embedded book calls importLorebook zero times", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);

    await svc.importCharacter({ card: { bytes: encoder.encode(V3_JSON), filename: "aria.json" } });

    expect(h.lorebooks).toHaveLength(0);
  });

  test("a TAKEN primary seat skips the embedded-book plane and names the kept book (#1598)", async () => {
    // The owner already holds a primary world book for this character — one they may have edited since the
    // card first landed. world-info's write REPLACES an existing primary's entries, so re-asserting the card's
    // book here would revert those edits (owner ruling 2026-09-05: it must not). The db-side proof is the int
    // mirror; this pins that the verb ASKS the oracle and reports the skip rather than writing.
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    h.setPrimaryBookTaken(true);

    const result = await svc.importCharacter({ card: { bytes: encoder.encode(CARD_WITH_BOOK_JSON), filename: "aria.json" } });

    expect(h.lorebooks).toHaveLength(0);
    expect(result.skippedOverlays).toHaveLength(1);
    expect(result.skippedOverlays[0]).toContain("was NOT re-asserted");
    expect(result.skippedOverlays[0]).toContain("restore door");
  });

  // ── carried attached-book references ─────────────────────────────────────────────────────────────────

  const bookA = castId<WorldBookId>("world_book_0000000000000000000000000a");
  const bookB = castId<WorldBookId>("world_book_0000000000000000000000000b");
  const cardWithRefs = (refs: { worldBookId: WorldBookId; role: string }[], includeEmbeddedBook = false): string =>
    JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Aria",
        description: "a bard",
        orbweaver_attached_books: refs,
        ...(includeEmbeddedBook
          ? { character_book: { name: "Aria's World", entries: [{ keys: ["k"], content: "c", comment: "C", insertion_order: 1 }] } }
          : {}),
      },
    });

  test("carries the card's attached-book references to the injected re-link op (roles preserved)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const card = cardWithRefs([
      { worldBookId: bookA, role: "primary" },
      { worldBookId: bookB, role: "auxiliary" },
    ]);

    const result = await svc.importCharacter({ card: { bytes: encoder.encode(card), filename: "aria.json" } });

    expect(h.linkBooks).toHaveLength(1);
    const call = h.linkBooks[0];
    if (call === undefined) {
      throw new Error("expected a recorded re-link call");
    }
    expect(call.ownerId).toBe(h.ownerId);
    expect(call.characterId).toBe(result.characterId);
    expect(call.refs).toEqual([
      { worldBookId: bookA, role: "primary" },
      { worldBookId: bookB, role: "auxiliary" },
    ]);
    expect(result.attachedBooksLinked).toBe(2);
    expect(result.attachedBooksSkipped).toBe(0);
  });

  test("a resolved reference SKIPS the embedded-lorebook clone (no duplicate book on the same install)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    // The card carries BOTH an embedded book AND references; the default fake links every ref.
    const card = cardWithRefs([{ worldBookId: bookA, role: "primary" }], true);

    const result = await svc.importCharacter({ card: { bytes: encoder.encode(card), filename: "aria.json" } });

    expect(result.attachedBooksLinked).toBe(1);
    // The reference IS the book on this install — cloning the embedded copy would double it.
    expect(h.lorebooks).toHaveLength(0);
  });

  test("falls back to the embedded clone when NO reference resolves (foreign install)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    // Foreign install: none of the carried ids exist here → the re-link links nothing, skips all.
    h.setLinkOutcome((refs) => ({ linked: 0, skipped: refs.length }));
    const card = cardWithRefs([{ worldBookId: bookA, role: "primary" }], true);

    const result = await svc.importCharacter({ card: { bytes: encoder.encode(card), filename: "aria.json" } });

    expect(result.attachedBooksLinked).toBe(0);
    expect(result.attachedBooksSkipped).toBe(1);
    // No reference resolved → the embedded book content is cloned so it isn't lost.
    expect(h.lorebooks).toHaveLength(1);
  });

  test("reports inaccessible references as skipped (surfaced in the result)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    h.setLinkOutcome(() => ({ linked: 1, skipped: 1 }));
    const card = cardWithRefs([
      { worldBookId: bookA, role: "primary" },
      { worldBookId: bookB, role: "auxiliary" },
    ]);

    const result = await svc.importCharacter({ card: { bytes: encoder.encode(card), filename: "aria.json" } });

    expect(result.attachedBooksLinked).toBe(1);
    expect(result.attachedBooksSkipped).toBe(1);
  });

  // ── #1470 — a run that dies after the character row is committed must not be permanently partial ────────
  test("a run that FAILS after the create heals on a retry of the same bytes — the dedup hit reconciles the missing planes", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const card = cardWithRefs([{ worldBookId: bookA, role: "primary" }], true);
    const bytes = encoder.encode(card);

    // RUN 1 — the carried-book re-link throws. The character row + its tags are already committed; the book
    // plane never ran. Before #1470 this state was permanent: the row carries the importHash, so every retry
    // of these bytes hit `existing !== null` and returned zeros without touching the missing planes.
    h.setLinkOutcome(() => {
      throw new Error("world-info unavailable");
    });
    await expect(svc.importCharacter({ card: { bytes } })).rejects.toThrow("world-info unavailable");
    expect(h.creates).toHaveLength(1);
    expect(h.lorebooks).toHaveLength(0);
    // The harness's create mints a deterministic id and registers its importHash, exactly as the real
    // provenance-stamping create does — so the retry below resolves THIS row through the dedup oracle.
    const characterId = castId<CharacterId>("character_created_1");

    // RUN 2 — the same bytes, world-info back (foreign install: nothing links, so the embedded clone is the
    // fallback). The dedup arm resolves the incomplete character and FINISHES it.
    h.setLinkOutcome((refs) => ({ linked: 0, skipped: refs.length }));
    const healed = await svc.importCharacter({ card: { bytes } });

    expect(healed.created).toBe(false);
    expect(healed.characterId).toBe(characterId);
    expect(h.creates).toHaveLength(1); // no second character was minted
    // …and the plane that was lost has landed, on the SAME character, with the report saying so.
    expect(h.lorebooks).toHaveLength(1);
    expect(h.lorebooks[0]?.characterId).toBe(characterId);
    expect(healed.attachedBooksLinked).toBe(0);
    expect(healed.attachedBooksSkipped).toBe(1);
  });

  test("a card carrying NO references never calls the re-link op (regression pin)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);

    const result = await svc.importCharacter({ card: { bytes: encoder.encode(V3_JSON), filename: "aria.json" } });

    expect(h.linkBooks).toHaveLength(0);
    expect(result.attachedBooksLinked).toBe(0);
    expect(result.attachedBooksSkipped).toBe(0);
  });

  test("a card with no tags carries none (no tag-attach calls)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const noTags = JSON.stringify({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "Bare", description: "no tags here" },
    });

    await svc.importCharacter({ card: { bytes: encoder.encode(noTags), filename: "bare.json" } });

    expect(h.tagAttaches).toHaveLength(0);
  });

  test("the dedup path RE-ASSERTS the card's tags against the existing character (#1470)", async () => {
    // This inverts a pin that used to assert the dedup arm attached nothing. That behaviour was the #1470
    // defect's other half: the tag attach is one of the planes a failed run can leave missing, and the arm
    // that could heal it was the arm that returned early. The attach is idempotent and by NAME, so
    // re-asserting a tag that already landed writes nothing.
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const bytes = encoder.encode(V3_JSON);

    const first = await svc.importCharacter({ card: { bytes } });
    h.tagAttaches.length = 0; // ignore the first import's attaches

    const second = await svc.importCharacter({ card: { bytes } });

    expect(second.created).toBe(false);
    expect(second.characterId).toBe(first.characterId);
    expect(h.tagAttaches.map((t) => t.tagName)).toEqual(["bard", "fantasy"]);
    for (const attach of h.tagAttaches) {
      expect(attach.characterId).toBe(first.characterId);
    }
  });

  test("a bare-JSON card stores no avatar (no image) and still creates", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);

    const result = await svc.importCharacter({
      card: { bytes: encoder.encode(V3_JSON), filename: "aria.json" },
    });

    expect(result.created).toBe(true);
    expect(h.stores).toHaveLength(0);
    const call = h.creates[0];
    if (call === undefined) {
      throw new Error("expected a recorded create call");
    }
    expect(call.input.avatarAssetId).toBeNull();
  });

  test("dedups on importHash: a byte-identical re-import mints NO second character and stores no avatar", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const bytes = encoder.encode(V3_JSON);

    const first = await svc.importCharacter({ card: { bytes } });
    const existingId = castId<CharacterId>("character_existing");
    h.setExisting(first.importHash, existingId);

    const second = await svc.importCharacter({ card: { bytes } });

    expect(second.created).toBe(false);
    expect(second.characterId).toBe(existingId);
    // The dedup arm short-circuits the CHARACTER write — the avatar store and the create never run again.
    // (It does re-assert the overlay planes; that is #1470's reconcile, pinned separately.)
    expect(h.creates).toHaveLength(1);
    expect(h.stores).toHaveLength(0);
  });

  test("throws ImportCardError(card_unreadable) when the bytes carry no readable card", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);

    await expect(svc.importCharacter({ card: { bytes: encoder.encode("garbage {{") } })).rejects.toBeInstanceOf(ImportCardError);
    expect(h.creates).toHaveLength(0);
  });

  // ── #1470 — a same-name card is never merged; a taken handle suffixes instead (never dedupe by name) ──

  test("a byte-NEW card whose name-slug is taken becomes a NEW character with a disambiguated HANDLE (name kept, never merged)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const existingId = castId<CharacterId>("character_existing");
    // The owner already has a character at the "aria" handle; this file's bytes were never seen (importHash miss).
    // We NEVER dedupe by name — a distinct card sharing a name is a distinct character (own UUID), not an edit.
    h.setExistingHandle(castId<CharacterHandle>("aria"), existingId);

    const editedCard = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Aria", description: "A wandering bard, now retired.", first_mes: "Welcome back." },
    });

    const result = await svc.importCharacter({
      card: { bytes: encoder.encode(editedCard), filename: "Aria.json" },
    });

    // A NEW character (own minted id), never the existing row; the existing character is untouched — the
    // context has no `updateCharacter` op left to call (#1470 dropped it, `ImportContext` has no such field).
    expect(result.created).toBe(true);
    expect(result.characterId).not.toBe(existingId);
    expect(h.creates).toHaveLength(1);
    const create = h.creates[0];
    if (create === undefined) {
      throw new Error("expected a recorded create call");
    }
    // The display NAME is preserved; only the per-owner-unique HANDLE slug is suffixed (`aria` was taken).
    expect(create.input.name).toBe("Aria");
    expect(create.input.handle).toBe("aria-2");
    expect(create.input.description).toBe("A wandering bard, now retired.");
  });

  test("a THIRD same-name card walks the handle suffix to the next free slot (aria → aria-2 → aria-3)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    h.setExistingHandle(castId<CharacterHandle>("aria"), castId<CharacterId>("character_a1"));
    h.setExistingHandle(castId<CharacterHandle>("aria-2"), castId<CharacterId>("character_a2"));

    const thirdCard = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Aria", description: "A third, entirely different bard." },
    });

    const result = await svc.importCharacter({
      card: { bytes: encoder.encode(thirdCard), filename: "aria-again.json" },
    });

    expect(result.created).toBe(true);
    expect(h.creates).toHaveLength(1);
    const create = h.creates[0];
    if (create === undefined) {
      throw new Error("expected a recorded create call");
    }
    expect(create.input.handle).toBe("aria-3");
    expect(create.input.name).toBe("Aria");
  });

  test("a brand-new card (no importHash or handle match) still inserts", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const newCard = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Bram", description: "A blacksmith." },
    });

    const result = await svc.importCharacter({
      card: { bytes: encoder.encode(newCard), filename: "bram.json" },
    });

    expect(result.created).toBe(true);
    expect(h.creates).toHaveLength(1);
    expect(h.findsByHandle.at(-1)?.handle).toBe("bram");
  });
});
