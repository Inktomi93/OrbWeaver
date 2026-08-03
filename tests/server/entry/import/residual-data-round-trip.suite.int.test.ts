// biome-ignore-all lint/style/useNamingConvention: ST Character-Card wire field names (snake_case) appear
// verbatim in these card fixtures — they ARE the format.
// PD-127 — the REAL DB-mediated import→export round-trip for `residualData`. Wave 4 proved the serde
// halves in isolation (`cardFromJson`/`buildCardV3` unit tests, `tests/server/kit/serde/card/index.test.ts`);
// this proves the actual flow a user hits: `runProfileImport` (the entry composition driver) wired to the
// REAL `createCharacterService` writes the parsed card's `residualData` into the `characters.residual_data`
// column, then the REAL `createExportService` reads that column back and re-emits it at the V3 card's
// `data` root. No fakes on the character/export services themselves — only `assets`/`tag` (cross-feature
// ops character doesn't own) are faked, matching the sanctioned harness pattern
// (`tests/server/domain/character/_support.ts`).

import { characterCardV3Schema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { readCardChunk } from "@orb/kit/png-card-chunk";
import { createCharacterService } from "@orb/server/domain/character";
import { createExportService } from "@orb/server/domain/export";
import type { ImportAssetPort, ImportTagPort } from "@orb/server/entry/import";
import { runProfileImport } from "@orb/server/entry/import";
import { describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { makeHarness as makeCharacterHarness, seedUser } from "../../domain/character/_support.ts";
import { makeHarness as makeExportHarness } from "../../domain/export/_support.ts";

// A bare V3 JSON card carrying: a GENUINELY-unknown `data.*` key (`custom_x` — the PD-127 residual survival
// gap), the now-TYPED-column fields (`source`/`nickname` — promoted out of residual, V3 promotion Phase A),
// and `group_only_greetings` (folded into the greetings array as a `groupOnly:true` entry — V3 promotion
// Phase B, re-split on export). No PNG, so no avatar store fires.
const CARD_WITH_RESIDUALS = JSON.stringify({
  spec: "chara_card_v3",
  spec_version: "3.0",
  data: {
    name: "Aria",
    description: "A wandering bard.",
    first_mes: "Hello there!",
    source: ["https://example.com/aria.png"],
    nickname: "Ari",
    group_only_greetings: ["*waves to the group*"],
    custom_x: { note: "keep me" },
  },
});

function principalOf(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "cookie" };
}

const noopAssets: ImportAssetPort = {
  store: (): Promise<{ assetId: AssetId }> => Promise.resolve({ assetId: castId<AssetId>("ast_unused") }),
};
const noopTag: ImportTagPort = {
  attachCardTagByName: (): Promise<boolean> => Promise.resolve(true),
};

describe("residualData survives the DB-mediated import→export round-trip (PD-127)", () => {
  test("import writes residualData to the characters row; export re-emits it at the card's data root", async () => {
    const db = await freshDb();
    const ownerId = await seedUser(db, { handle: castId<Handle>("residual-owner") });
    const principal = principalOf(ownerId);

    const characterSvc = createCharacterService(makeCharacterHarness(db).ctx);

    const result = await runProfileImport({
      principal,
      character: {
        create: async (p) => ({ id: (await characterSvc.create(p)).id }),
        update: async (p) => ({ id: (await characterSvc.update(p)).id }),
        findByImportHash: (p) => characterSvc.findByImportHash(p),
        findByHandle: (p) => characterSvc.findByHandle(p),
      },
      assets: noopAssets,
      tag: noopTag,
      files: [{ bytes: new TextEncoder().encode(CARD_WITH_RESIDUALS), filename: "aria.json" }],
    });

    expect(result.failed).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    const characterId = result.imported[0]?.characterId as CharacterId;

    // Only the GENUINELY-unknown key lands in residualData — `source`/`nickname` are typed columns now
    // (Phase A) and `group_only_greetings` folds into the greetings array (Phase B), so neither double-rides.
    const detail = await characterSvc.get({ principal, characterId });
    expect(detail.residualData).toEqual({ custom_x: { note: "keep me" } });
    // The group-only greeting folded into the greetings array, flagged; first_mes stays at [0].
    expect(detail.greetings[0]).toEqual({ text: "Hello there!" });
    expect(detail.greetings).toContainEqual({ text: "*waves to the group*", groupOnly: true });

    // Export reads the SAME row through the real export verb and re-emits the residuals at the data root.
    const exportSvc = createExportService(makeExportHarness(db).ctx);
    const exported = await exportSvc.exportCharacter({ principal, characterId });
    if (exported === null) {
      throw new Error("expected an exported card");
    }
    const chunk = await readCardChunk(exported.bytes, "ccv3");
    if (chunk === null) {
      throw new Error("exported PNG carried no ccv3 card chunk");
    }
    const card = characterCardV3Schema.parse(JSON.parse(chunk));

    // The genuinely-unknown residual survives the DB round-trip, re-emitted at the data root.
    expect(card.data["custom_x"]).toEqual({ note: "keep me" });
    // The typed columns (Phase A) + the re-split group-only greeting (Phase B) ride the wire alongside it.
    expect(card.data["source"]).toEqual(["https://example.com/aria.png"]);
    expect(card.data["nickname"]).toBe("Ari");
    expect(card.data["group_only_greetings"]).toEqual(["*waves to the group*"]);
    expect(card.data.name).toBe("Aria");
    expect(card.data.first_mes).toBe("Hello there!");
  });

  test("a card with no unknown data.* keys round-trips residualData as null (no phantom residual)", async () => {
    const db = await freshDb();
    const ownerId = await seedUser(db, { handle: castId<Handle>("no-residual-owner") });
    const principal = principalOf(ownerId);
    const characterSvc = createCharacterService(makeCharacterHarness(db).ctx);

    const plainCard = JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Bram", description: "A blacksmith." },
    });

    const result = await runProfileImport({
      principal,
      character: {
        create: async (p) => ({ id: (await characterSvc.create(p)).id }),
        update: async (p) => ({ id: (await characterSvc.update(p)).id }),
        findByImportHash: (p) => characterSvc.findByImportHash(p),
        findByHandle: (p) => characterSvc.findByHandle(p),
      },
      assets: noopAssets,
      tag: noopTag,
      files: [{ bytes: new TextEncoder().encode(plainCard), filename: "bram.json" }],
    });

    const characterId = result.imported[0]?.characterId as CharacterId;
    const detail = await characterSvc.get({ principal, characterId });
    expect(detail.residualData).toBeNull();
  });
});
