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

// A bare V3 JSON card carrying unknown top-level `data.*` keys ST-V3 puts there (PD-127's exact gap):
// `source` (provenance URL array), `nickname`, `group_only_greetings`. No PNG, so no avatar store fires.
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
  },
});

function principalOf(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "cookie" };
}

const noopAssets: ImportAssetPort = {
  store: (): Promise<{ assetId: AssetId }> =>
    Promise.resolve({ assetId: castId<AssetId>("ast_unused") }),
};
const noopTag: ImportTagPort = {
  attachCardTagByName: (): Promise<boolean> => Promise.resolve(true),
};

describe("residualData survives the DB-mediated import→export round-trip (PD-127)", () => {
  test("import writes residualData to the characters row; export re-emits it at the card's data root", async () => {
    const db = await freshDb();
    const ownerId = await seedUser(db, { handle: "residual-owner" });
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

    // The residual keys landed on the flat row (not dropped, not silently eaten).
    const detail = await characterSvc.get({ principal, characterId });
    expect(detail.residualData).toEqual({
      source: ["https://example.com/aria.png"],
      nickname: "Ari",
      group_only_greetings: ["*waves to the group*"],
    });

    // Export reads the SAME row through the real export verb and re-emits the residuals at the data root.
    const exportSvc = createExportService(makeExportHarness(db).ctx);
    const exported = await exportSvc.exportCharacter({ principal, characterId });
    if (exported === null) {
      throw new Error("expected an exported card");
    }
    const chunk = readCardChunk(exported.bytes, "ccv3");
    if (chunk === null) {
      throw new Error("exported PNG carried no ccv3 card chunk");
    }
    const card = characterCardV3Schema.parse(JSON.parse(chunk));

    expect(card.data["source"]).toEqual(["https://example.com/aria.png"]);
    expect(card.data["nickname"]).toBe("Ari");
    expect(card.data["group_only_greetings"]).toEqual(["*waves to the group*"]);
    // The typed fields still round-trip correctly alongside the residuals.
    expect(card.data.name).toBe("Aria");
    expect(card.data.first_mes).toBe("Hello there!");
  });

  test("a card with no unknown data.* keys round-trips residualData as null (no phantom residual)", async () => {
    const db = await freshDb();
    const ownerId = await seedUser(db, { handle: "no-residual-owner" });
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
