// biome-ignore-all lint/style/useNamingConvention: ST Character-Card wire field names (snake_case) appear
// verbatim in the card fixture — they ARE the format.
// Mirror test for domain/import/verbs/import-character — the card-import verb (test-presence). Asserts the
// end-to-end card path over the injected fakes: a real ST card → flatten + provenance into the create op,
// the PNG-card avatar store, the bare-JSON no-avatar path, the importHash dedup oracle, and the unreadable
// throw. EVERY INVARIANT SHIPS ITS ENFORCER.

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
const MINIMAL_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

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
    // provenance: the filename + the whole-file hash (which the result echoes).
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

    // First run creates it; capture the hash, then seed the oracle as if it already exists.
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

    await expect(
      svc.importCharacter({ card: { bytes: encoder.encode("garbage {{") } }),
    ).rejects.toBeInstanceOf(ImportCardError);
    expect(h.creates).toHaveLength(0);
  });
});
