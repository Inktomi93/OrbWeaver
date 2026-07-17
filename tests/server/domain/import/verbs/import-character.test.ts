// biome-ignore-all lint/style/useNamingConvention: ST Character-Card wire field names (snake_case) appear
// verbatim in the card fixture — they ARE the format.
// Mirror test for domain/import/verbs/import-character — the card-import verb (test-presence). Asserts the
// end-to-end card path over the injected fakes: a real ST card → flatten + provenance into the create op,
// the PNG-card avatar store, the bare-JSON no-avatar path, the importHash dedup oracle, the raw card-tag
// carry (no extraction-side dedupe), and the unreadable throw. EVERY INVARIANT SHIPS ITS ENFORCER.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { createImportService, ImportCardError } from "@orb/server/domain/import";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";
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
    creator: "nate",
    creator_notes: "",
    character_version: "1.0",
    tags: ["bard", "fantasy"],
    extensions: {},
  },
};
const V3_JSON = JSON.stringify(V3_CARD);
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
    expect(call.input.greetings).toEqual(["Hello there!", "Well met."]);
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

  // ── PD-144 — carried attached-book references ───────────────────────────────────────────────────────

  const BOOK_A = "world_book_0000000000000000000000000a";
  const BOOK_B = "world_book_0000000000000000000000000b";
  const cardWithRefs = (refs: { worldBookId: string; role: string }[], includeEmbeddedBook = false): string =>
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
      { worldBookId: BOOK_A, role: "primary" },
      { worldBookId: BOOK_B, role: "auxiliary" },
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
      { worldBookId: BOOK_A, role: "primary" },
      { worldBookId: BOOK_B, role: "auxiliary" },
    ]);
    expect(result.attachedBooksLinked).toBe(2);
    expect(result.attachedBooksSkipped).toBe(0);
  });

  test("a resolved reference SKIPS the embedded-lorebook clone (no duplicate book on the same install)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    // The card carries BOTH an embedded book AND references; the default fake links every ref.
    const card = cardWithRefs([{ worldBookId: BOOK_A, role: "primary" }], true);

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
    const card = cardWithRefs([{ worldBookId: BOOK_A, role: "primary" }], true);

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
      { worldBookId: BOOK_A, role: "primary" },
      { worldBookId: BOOK_B, role: "auxiliary" },
    ]);

    const result = await svc.importCharacter({ card: { bytes: encoder.encode(card), filename: "aria.json" } });

    expect(result.attachedBooksLinked).toBe(1);
    expect(result.attachedBooksSkipped).toBe(1);
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

  test("the dedup path attaches NO tags (tags landed on the first import)", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const bytes = encoder.encode(V3_JSON);

    const first = await svc.importCharacter({ card: { bytes } });
    h.tagAttaches.length = 0; // ignore the first import's attaches
    h.setExisting(first.importHash, castId<CharacterId>("character_existing"));

    await svc.importCharacter({ card: { bytes } });

    expect(h.tagAttaches).toHaveLength(0);
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

  test("dedups on importHash: a byte-identical re-import returns the existing character, no write", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const bytes = encoder.encode(V3_JSON);

    const first = await svc.importCharacter({ card: { bytes } });
    const existingId = castId<CharacterId>("character_existing");
    h.setExisting(first.importHash, existingId);

    const second = await svc.importCharacter({ card: { bytes } });

    expect(second.created).toBe(false);
    expect(second.characterId).toBe(existingId);
    // dedup short-circuits BEFORE any avatar store or create — only the first run wrote.
    expect(h.creates).toHaveLength(1);
    expect(h.stores).toHaveLength(0);
  });

  test("throws ImportCardError(card_unreadable) when the bytes carry no readable card", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);

    await expect(svc.importCharacter({ card: { bytes: encoder.encode("garbage {{") } })).rejects.toBeInstanceOf(ImportCardError);
    expect(h.creates).toHaveLength(0);
  });

  // ── PD-108 — re-import of an edited / second same-name card ─────────────────────────────────────────

  test("re-importing an EDITED card (same handle, different bytes+content) edits the existing row in place — no failure, no insert", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const existingId = castId<CharacterId>("character_existing");
    // The owner already has a character at the "aria" handle (e.g. from a prior import or app-authored
    // create) — the importHash dedup oracle is EMPTY (this file's bytes were never seen before).
    h.setExistingHandle("aria", existingId);

    const editedCard = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Aria",
        description: "A wandering bard, now retired.",
        first_mes: "Welcome back.",
      },
    });

    const result = await svc.importCharacter({
      card: { bytes: encoder.encode(editedCard), filename: "Aria.json" },
    });

    // Edit-in-place (D28): NOT created, NOT a failure — the existing row is targeted for update.
    expect(result.created).toBe(false);
    expect(result.characterId).toBe(existingId);
    expect(h.creates).toHaveLength(0);
    expect(h.updates).toHaveLength(1);
    const update = h.updates[0];
    if (update === undefined) {
      throw new Error("expected a recorded update call");
    }
    expect(update.ownerId).toBe(h.ownerId);
    expect(update.characterId).toBe(existingId);
    expect(update.input.description).toBe("A wandering bard, now retired.");
    expect(update.input.greetings).toEqual(["Welcome back."]);
  });

  test("a second same-name card resolves via the (ownerId, handle) match — no unique-constraint failure", async () => {
    const h = makeHarness();
    const svc = createImportService(h.ctx);
    const existingId = castId<CharacterId>("character_existing");
    h.setExistingHandle("aria", existingId);

    // A DIFFERENT card that happens to share the derived handle ("aria") — the exact PD-108 dead-end case
    // (would have tripped `characters_owner_handle_unique` on a blind insert).
    const secondCard = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Aria", description: "An entirely different bard." },
    });

    const result = await svc.importCharacter({
      card: { bytes: encoder.encode(secondCard), filename: "aria-2.json" },
    });

    expect(result.created).toBe(false);
    expect(result.characterId).toBe(existingId);
    expect(h.creates).toHaveLength(0);
    expect(h.updates).toHaveLength(1);
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
    expect(h.updates).toHaveLength(0);
    expect(h.findsByHandle.at(-1)?.handle).toBe("bram");
  });
});
