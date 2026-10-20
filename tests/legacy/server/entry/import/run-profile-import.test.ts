// entry/import/run-profile-import — the bulk-import driver. Pins the load-bearing behavior: it builds the
// per-owner ImportService over the entry-supplied character/assets ops, stamps import provenance on create,
// dedups a byte-identical re-import, scopes the dedup lookup to the principal's userId, and ISOLATES a bad
// card (the batch continues; the failure is recorded, never thrown). The handle-suffix disambiguation loop
// (`freeHandle`, #1470 — never dedupe by name) is pinned at the domain level
// (`tests/legacy/server/domain/import/verbs/import-character.test.ts`); the driver tests here stub `findByHandle`
// as a miss since none of these cases exercise it.

import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportAssetPort } from "@orb/server/domain/assets";
import type { ImportCharacterPort } from "@orb/server/domain/character";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import type { AttachCardTagByNameParams } from "#server/domain/tag/contract/params.ts";
import type { ImportTagPort } from "#server/domain/tag/index.ts";
import { runProfileImport } from "#server/entry/import/index.ts";
import { principal as makePrincipal } from "../../../db/schema/_support.ts";

// The subject reads no user rows of its own; these callers resolve from rows in one in-memory database.
const callersDb = await freshDb();
const OWNER: Principal = await makePrincipal({ db: callersDb }, castId<UserId>("usr_owner"), { role: "owner", handle: castId<Handle>("owner") });

// A readable bare-V2 JSON card (no PNG → no avatar store). Authored as a string so its snake_case wire
// keys don't trip useNamingConvention.
const CARD_JSON = '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Tester","description":"A test character."}}';
const cardBytes = (): Uint8Array => new TextEncoder().encode(CARD_JSON);
const garbageBytes = (): Uint8Array => new TextEncoder().encode("not a character card");
const SHA256_HEX = /^[0-9a-f]{64}$/u;

// A store that never fires for these JSON-card tests (typed const → contextual, no explicit-return noise).
const noopAssets: ImportAssetPort = {
  store: (): Promise<{ assetId: AssetId }> => Promise.resolve({ assetId: castId<AssetId>("ast_x") }),
};

// The handle-suffix disambiguation loop (`freeHandle`) is pinned at the domain level; these driver tests
// don't exercise it — `findByHandle` always misses (#1470 dropped `ImportCharacterPort`'s `update` op
// entirely — the earlier handle-match edit-in-place this stub backed no longer exists).
const noHandleMatch: Pick<ImportCharacterPort, "findByHandle" | "findByName" | "attachImportedArt"> = {
  findByHandle: (): Promise<null> => Promise.resolve(null),
  findByName: (): Promise<readonly never[]> => Promise.resolve([]),
  attachImportedArt: (): Promise<boolean> => Promise.resolve(false),
};

type TagAttachCall = AttachCardTagByNameParams;

/** Records the importer's tag provenance and application policy at the owning-domain boundary. */
function recordingTag(): { readonly tag: ImportTagPort; readonly calls: TagAttachCall[] } {
  const calls: TagAttachCall[] = [];
  return {
    calls,
    tag: {
      attachCardTagByName: (params): Promise<boolean> => {
        calls.push(params);
        return Promise.resolve(true);
      },
    },
  };
}

// A no-op tag port for tests that don't assert on the carry.
const noopTag: ImportTagPort = {
  attachCardTagByName: (): Promise<boolean> => Promise.resolve(true),
};

describe("runProfileImport", () => {
  test("imports a readable card, stamping import provenance + created:true", async () => {
    const createCalls: { handle: CharacterHandle; importedFrom: string | null; importHash: string }[] = [];
    const character: ImportCharacterPort = {
      create: (p): Promise<{ id: CharacterId }> => {
        createCalls.push({
          handle: p.input.handle,
          importedFrom: p.provenance?.importedFrom ?? null,
          importHash: p.provenance?.importHash ?? "",
        });
        return Promise.resolve({ id: castId<CharacterId>("chr_a") });
      },
      ...noHandleMatch,
      findByImportHash: (): Promise<null> => Promise.resolve(null),
    };
    let stores = 0;
    const assets: ImportAssetPort = {
      store: (): Promise<{ assetId: AssetId }> => {
        stores += 1;
        return Promise.resolve({ assetId: castId<AssetId>("ast_a") });
      },
    };

    const result = await runProfileImport({
      principal: OWNER,
      character,
      assets,
      tag: noopTag,
      files: [{ bytes: cardBytes(), filename: "Aria.png" }],
    });

    expect(result.failed).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]?.created).toBe(true);
    expect(result.imported[0]?.characterId).toBe("chr_a");
    expect(result.imported[0]?.filename).toBe("Aria.png");
    expect(createCalls).toHaveLength(1);
    const call = createCalls[0];
    expect(call?.importedFrom).toBe("Aria.png");
    expect(call?.importHash).toMatch(SHA256_HEX);
    // A bare-JSON card carries no image → no avatar is stored.
    expect(stores).toBe(0);
  });

  test("dedups a byte-identical re-import (created:false, no create call)", async () => {
    let createCount = 0;
    const character: ImportCharacterPort = {
      create: (): Promise<{ id: CharacterId }> => {
        createCount += 1;
        return Promise.resolve({ id: castId<CharacterId>("chr_new") });
      },
      findByImportHash: (): Promise<{ characterId: CharacterId }> => Promise.resolve({ characterId: castId<CharacterId>("chr_existing") }),
      ...noHandleMatch,
    };

    const result = await runProfileImport({
      principal: OWNER,
      character,
      assets: noopAssets,
      tag: noopTag,
      files: [{ bytes: cardBytes(), filename: "Aria.png" }],
    });

    expect(result.imported[0]?.created).toBe(false);
    expect(result.imported[0]?.characterId).toBe("chr_existing");
    expect(createCount).toBe(0);
  });

  test("isolates an unreadable card — the batch continues, the failure is recorded", async () => {
    const character: ImportCharacterPort = {
      create: (): Promise<{ id: CharacterId }> => Promise.resolve({ id: castId<CharacterId>("chr_ok") }),
      findByImportHash: (): Promise<null> => Promise.resolve(null),
      ...noHandleMatch,
    };

    const result = await runProfileImport({
      principal: OWNER,
      character,
      assets: noopAssets,
      tag: noopTag,
      files: [
        { bytes: garbageBytes(), filename: "bad.json" },
        { bytes: cardBytes(), filename: "ok.json" },
      ],
    });

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]?.characterId).toBe("chr_ok");
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.filename).toBe("bad.json");
    expect(result.failed[0]?.error).toBeTruthy();
  });

  test("scopes the dedup lookup to the principal's userId", async () => {
    let seenOwner: string | null = null;
    const character: ImportCharacterPort = {
      create: (): Promise<{ id: CharacterId }> => Promise.resolve({ id: castId<CharacterId>("chr") }),
      findByImportHash: (p): Promise<null> => {
        seenOwner = p.ownerId;
        return Promise.resolve(null);
      },
      ...noHandleMatch,
    };

    await runProfileImport({
      principal: OWNER,
      character,
      assets: noopAssets,
      tag: noopTag,
      files: [{ bytes: cardBytes() }],
    });

    expect(seenOwner).toBe(OWNER.userId);
  });

  test("threads the card regex-script lift, so a card's embedded scripts reach the regex domain through this door", async () => {
    const character: ImportCharacterPort = {
      create: (): Promise<{ id: CharacterId }> => Promise.resolve({ id: castId<CharacterId>("chr_scripted") }),
      findByImportHash: (): Promise<null> => Promise.resolve(null),
      ...noHandleMatch,
    };
    // Raw ST wire TEXT (snake_case by spec) — the format IS the fixture.
    const withScripts =
      '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Scripted","description":"x","extensions":{"regex_scripts":[{"id":"st-1","scriptName":"Trim ellipsis","findRegex":"/\\\\.{3}/g","replaceString":"…","placement":[2],"disabled":false}]}}}';
    const lifts: { readonly characterId: CharacterId; readonly scripts: number }[] = [];

    const result = await runProfileImport({
      principal: OWNER,
      character,
      assets: noopAssets,
      tag: noopTag,
      importCardScripts: ({ characterId, scripts }) => {
        lifts.push({ characterId, scripts: scripts.length });
        return Promise.resolve({ created: scripts.length, reused: 0 });
      },
      files: [{ bytes: new TextEncoder().encode(withScripts), filename: "scripted.json" }],
    });

    expect(result.failed).toHaveLength(0);
    expect(lifts).toEqual([{ characterId: "chr_scripted", scripts: 1 }]);
  });

  test("applies the card author's tags to the created character", async () => {
    const character: ImportCharacterPort = {
      create: (): Promise<{ id: CharacterId }> => Promise.resolve({ id: castId<CharacterId>("chr_tagged") }),
      findByImportHash: (): Promise<null> => Promise.resolve(null),
      ...noHandleMatch,
    };
    const tagged = '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Tagged","description":"x","tags":["bard","fantasy"]}}';
    const rec = recordingTag();

    await runProfileImport({
      principal: OWNER,
      character,
      assets: noopAssets,
      tag: rec.tag,
      files: [{ bytes: new TextEncoder().encode(tagged), filename: "tagged.json" }],
    });

    expect(rec.calls).toHaveLength(2);
    for (const call of rec.calls) {
      expect(call.ownerId).toBe(OWNER.userId);
      expect(call.characterId).toBe("chr_tagged");
      expect(call.source).toBe("card");
      expect(call.status).toBe("accepted");
    }
    expect(rec.calls.map((c) => c.tagName)).toEqual(["bard", "fantasy"]);
  });
});
