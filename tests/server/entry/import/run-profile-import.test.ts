// entry/import/run-profile-import — the bulk-import driver. Pins the load-bearing behavior: it builds the
// per-owner ImportService over the entry-supplied character/assets ops, stamps import provenance on create,
// dedups a byte-identical re-import, scopes the dedup lookup to the principal's userId, and ISOLATES a bad
// card (the batch continues; the failure is recorded, never thrown) — import.md §"bulk driver" / inv 8.

import type { Principal } from "@orb/contracts/identity";
import type { TagSource, TagStatus } from "@orb/contracts/tag";
import type { AssetId, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort } from "@orb/server/entry/import";
import { runProfileImport } from "@orb/server/entry/import";
import { describe, expect, test } from "vitest";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};

// A readable bare-V2 JSON card (no PNG → no avatar store). Authored as a string so its snake_case wire
// keys don't trip useNamingConvention.
const CARD_JSON =
  '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Tester","description":"A test character."}}';
const cardBytes = (): Uint8Array => new TextEncoder().encode(CARD_JSON);
const garbageBytes = (): Uint8Array => new TextEncoder().encode("not a character card");
const SHA256_HEX = /^[0-9a-f]{64}$/u;

// A store that never fires for these JSON-card tests (typed const → contextual, no explicit-return noise).
const noopAssets: ImportAssetPort = {
  store: (): Promise<{ assetId: AssetId }> =>
    Promise.resolve({ assetId: castId<AssetId>("ast_x") }),
};

interface TagAttachCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
  readonly source: TagSource;
  readonly status: TagStatus;
}

/** A recording tag port (the driver binds source:'card'/status:'pending'; tests assert exactly that). */
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
    const createCalls: { handle: string; importedFrom: string | null; importHash: string }[] = [];
    const character: ImportCharacterPort = {
      create: (p): Promise<{ id: CharacterId }> => {
        createCalls.push({
          handle: p.input.handle,
          importedFrom: p.provenance?.importedFrom ?? null,
          importHash: p.provenance?.importHash ?? "",
        });
        return Promise.resolve({ id: castId<CharacterId>("chr_a") });
      },
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
      findByImportHash: (): Promise<{ characterId: CharacterId }> =>
        Promise.resolve({ characterId: castId<CharacterId>("chr_existing") }),
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
      create: (): Promise<{ id: CharacterId }> =>
        Promise.resolve({ id: castId<CharacterId>("chr_ok") }),
      findByImportHash: (): Promise<null> => Promise.resolve(null),
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
      create: (): Promise<{ id: CharacterId }> =>
        Promise.resolve({ id: castId<CharacterId>("chr") }),
      findByImportHash: (p): Promise<null> => {
        seenOwner = p.ownerId;
        return Promise.resolve(null);
      },
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

  test("carries the card's tags as card/pending suggestions to the created character", async () => {
    const character: ImportCharacterPort = {
      create: (): Promise<{ id: CharacterId }> =>
        Promise.resolve({ id: castId<CharacterId>("chr_tagged") }),
      findByImportHash: (): Promise<null> => Promise.resolve(null),
    };
    const tagged =
      '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Tagged","description":"x","tags":["bard","fantasy"]}}';
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
      expect(call.status).toBe("pending");
    }
    expect(rec.calls.map((c) => c.tagName)).toEqual(["bard", "fantasy"]);
  });
});
