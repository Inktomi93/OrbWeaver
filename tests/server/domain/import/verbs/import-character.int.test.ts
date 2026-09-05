// verb: importCharacter — the PLUGIN-FUNNEL provenance channel (#1702), against a real db + the real
// character service (the same wiring `entry/compose/services.ts`'s `runInstallerCharacterImport` composes
// via `buildImportContext`). A card ingested through a plugin's `character.ingest`/`ingestAsset` capability
// carries no filename (its wire shape is `{card}`/`{assetId}`, never a name) — before #1702 this left
// `importedFrom` null, so `characterProvenanceOf` read every hub-ingested card as `authored` ("Made here")
// and `findByImportedFrom` could never match a plugin-ingested row. RED-FIRST: on the unmodified funnel
// (pre-fix) `card.pluginId` did not exist on `ImportCardInput`, so this same assertion read
// `importedFrom === null` / `provenance === "authored"`.

import { characterProvenanceOf, pluginImportedFrom } from "@orb/contracts/character";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { createImportService } from "@orb/server/domain/import";
import { buildImportContext } from "@orb/server/entry/import";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedUser } from "../../character/_support.ts";

const encoder = new TextEncoder();
const CARD_JSON = JSON.stringify({
  spec: "chara_card_v3",
  spec_version: "3.0",
  data: { name: "Seraphina", description: "A hub-ingested bard.", first_mes: "Hello!" },
});
const CARD_ATLAS = castId<PluginId>("plugin_01k4cardat0a50000000000000");

describe("importCharacter — plugin-funnel provenance (#1702)", () => {
  test("a card ingested with pluginId (no filename) stamps a plugin importedFrom; provenance is NOT authored", async () => {
    const db = await freshDb();
    const character = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const principal = makePrincipal(owner);
    const importCtx = buildImportContext({
      principal,
      character,
      storeAvatar: () => Promise.reject(new Error("no avatar expected for a JSON card")),
      attachCardTag: () => Promise.resolve(true),
    });
    const svc = createImportService(importCtx);
    const bytes = encoder.encode(CARD_JSON);

    const result = await svc.importCharacter({ card: { bytes, pluginId: CARD_ATLAS } });

    expect(result.created).toBe(true);
    const detail = await character.get({ principal, characterId: result.characterId });
    const expectedImportedFrom = pluginImportedFrom(CARD_ATLAS, result.importHash);
    expect(detail.importedFrom).toBe(expectedImportedFrom);
    // The #843/#865 derivation is untouched — a non-null importedFrom is `imported`, never `authored`
    // ("Made here"), which is the whole defect this row fixes.
    expect(detail.provenance).toBe("imported");
    expect(characterProvenanceOf(detail)).toBe("imported");
    expect(characterProvenanceOf(detail)).not.toBe("authored");
  });

  test("findByImportedFrom matches the plugin-minted string — the hub's already-imported / re-ingest marker", async () => {
    const db = await freshDb();
    const character = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const principal = makePrincipal(owner);
    const importCtx = buildImportContext({
      principal,
      character,
      storeAvatar: () => Promise.reject(new Error("no avatar expected for a JSON card")),
      attachCardTag: () => Promise.resolve(true),
    });
    const svc = createImportService(importCtx);
    const bytes = encoder.encode(CARD_JSON);

    const first = await svc.importCharacter({ card: { bytes, pluginId: CARD_ATLAS } });
    const provenanceValue = pluginImportedFrom(CARD_ATLAS, first.importHash);

    const matches = await character.findByImportedFrom({ ownerId: owner, values: [provenanceValue] });
    expect(matches).toEqual([{ importedFrom: provenanceValue, characterId: first.characterId }]);

    // A second ingest of the SAME bytes through the SAME plugin dedupes on importHash (pre-existing
    // behaviour) — the row `findByImportedFrom` just matched is exactly the row a re-ingest resolves to.
    const second = await svc.importCharacter({ card: { bytes, pluginId: CARD_ATLAS } });
    expect(second.created).toBe(false);
    expect(second.characterId).toBe(first.characterId);
  });
});
