// entry/import/build-import-context — the one place the per-owner `ImportContext` is assembled from
// entry-supplied ports, shared by the sync card-upload driver and the bundle/profile composition. Its whole
// job is BINDING, and every binding it makes is a security decision the domain cannot re-make:
//
//   • OWNER SCOPE COMES FROM THE PRINCIPAL, NOT FROM THE ARGUMENT. All five of the domain-facing ops
//     (`createCharacter` / `findByImportHash` / `findByHandle` / `storeAsset` / `attachCardTag`) are
//     declared with an `ownerId` in their args, and this wiring DROPS it in favour of `principal.userId`.
//     That drop is the cross-tenant belt: an import driver (or a future caller) that put a foreign ownerId
//     on the wire cannot make the character/tag front door read or write another account's rows. Each is
//     asserted here by passing a DIFFERENT ownerId in and proving the port still sees the principal's.
//   • THE CARD-TAG CARRY IS PINNED TO card/pending. Author-shipped tags are UNTRUSTED input; landing them
//     as anything other than a staged suggestion would let a card's own metadata write accepted library
//     labels.
//   • THE AVATAR STORE IS enforceMagic:false, kind:"avatar". Deliberate (the card's own embedded avatar has
//     already been parsed), and exactly the kind of default that must never flip silently in either
//     direction — so it is asserted explicitly rather than left to the reader.
//   • OPTIONAL PORTS ARE OMITTED, NEVER `undefined`. `exactOptionalPropertyTypes`: a card-only composition
//     must not present a KEY whose value is undefined, or the domain's `ctx.importLorebook !== undefined`
//     capability checks read as present-and-broken instead of absent.

import type { CreateCharacterInput } from "@orb/contracts/character";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportAssetPort, ImportCharacterPort, ImportContextWiring, ImportTagPort } from "@orb/server/entry/import";
import { buildImportContext } from "@orb/server/entry/import";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_owner");
const FOREIGN = castId<UserId>("usr_victim");
const CHARACTER = castId<CharacterId>("chr_aria");
const ASSET = castId<AssetId>("ast_avatar");

const PRINCIPAL: Principal = { userId: OWNER, role: "user", handle: castId<Handle>("owner"), externalId: null, via: "cookie" };

/** A real parsed CREATE input — the same contract the tRPC router and the import normalizer validate. */
const CARD: CreateCharacterInput = createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A test character." });

interface Ports {
  readonly create: Mock<ImportCharacterPort["create"]>;
  readonly findByImportHash: Mock<ImportCharacterPort["findByImportHash"]>;
  readonly findByHandle: Mock<ImportCharacterPort["findByHandle"]>;
  readonly storeAvatar: Mock<ImportAssetPort["store"]>;
  readonly attachCardTag: Mock<ImportTagPort["attachCardTagByName"]>;
}

function ports(): Ports {
  return {
    create: vi.fn<ImportCharacterPort["create"]>(() => Promise.resolve({ id: CHARACTER })),
    findByImportHash: vi.fn<ImportCharacterPort["findByImportHash"]>(() => Promise.resolve({ characterId: CHARACTER })),
    findByHandle: vi.fn<ImportCharacterPort["findByHandle"]>(() => Promise.resolve(null)),
    storeAvatar: vi.fn<ImportAssetPort["store"]>(() => Promise.resolve({ assetId: ASSET })),
    attachCardTag: vi.fn<ImportTagPort["attachCardTagByName"]>(() => Promise.resolve(true)),
  };
}

function wiring(p: Ports): ImportContextWiring {
  return {
    principal: PRINCIPAL,
    character: { create: p.create, findByImportHash: p.findByImportHash, findByHandle: p.findByHandle },
    storeAvatar: p.storeAvatar,
    attachCardTag: p.attachCardTag,
  };
}

describe("buildImportContext — owner scope is the PRINCIPAL's, never the argument's", () => {
  test("ownerId on the context is the principal's userId", () => {
    expect(buildImportContext(wiring(ports())).ownerId).toBe(OWNER);
  });

  test("createCharacter writes under the principal and carries the import provenance verbatim", async () => {
    const p = ports();
    const ctx = buildImportContext(wiring(p));

    const ref = await ctx.createCharacter({ ownerId: FOREIGN, input: CARD, importedFrom: "Aria.png", importHash: "h1" });

    expect(ref).toStrictEqual({ characterId: CHARACTER });
    expect(p.create).toHaveBeenCalledWith({ principal: PRINCIPAL, input: CARD, provenance: { importedFrom: "Aria.png", importHash: "h1" } });
    // The foreign ownerId never reaches the front door — the Principal is the only owner the write sees.
    expect(JSON.stringify(p.create.mock.calls[0])).not.toContain(FOREIGN);
  });

  test("the dedup oracles are scoped to the principal (a foreign ownerId cannot probe another library)", async () => {
    const p = ports();
    const ctx = buildImportContext(wiring(p));

    await ctx.findByImportHash({ ownerId: FOREIGN, importHash: "h1" });
    await ctx.findByHandle({ ownerId: FOREIGN, handle: castId<CharacterHandle>("aria") });

    expect(p.findByImportHash).toHaveBeenCalledWith({ ownerId: OWNER, importHash: "h1" });
    expect(p.findByHandle).toHaveBeenCalledWith({ ownerId: OWNER, handle: "aria" });
  });

  test("the dedup oracles collapse a miss to null (never leak the port's row shape)", async () => {
    const p = ports();
    const ctx = buildImportContext(wiring(p));
    p.findByImportHash.mockResolvedValue(null);

    expect(await ctx.findByImportHash({ ownerId: OWNER, importHash: "nope" })).toBeNull();
    expect(await ctx.findByHandle({ ownerId: OWNER, handle: castId<CharacterHandle>("nope") })).toBeNull();
    expect(await ctx.findByImportHash({ ownerId: OWNER, importHash: "h1" })).toBeNull();
  });

  test("storeAsset binds kind:'avatar' + enforceMagic:false under the principal, and returns the id only", async () => {
    const p = ports();
    const ctx = buildImportContext(wiring(p));
    const bytes = new Uint8Array([1, 2, 3]);

    const assetId = await ctx.storeAsset({ ownerId: FOREIGN, bytes, mime: "image/png" });

    expect(assetId).toBe(ASSET);
    expect(p.storeAvatar).toHaveBeenCalledWith({ principal: PRINCIPAL, bytes, kind: "avatar", mime: "image/png", enforceMagic: false });
  });
});

describe("buildImportContext — the author-shipped tag carry stays a STAGED suggestion", () => {
  test("attachCardTag binds source:'card', status:'pending' (a card's own metadata never lands accepted)", async () => {
    const p = ports();
    const ctx = buildImportContext(wiring(p));

    await ctx.attachCardTag({ ownerId: OWNER, characterId: CHARACTER, tagName: "fantasy" });

    expect(p.attachCardTag).toHaveBeenCalledWith({ ownerId: OWNER, characterId: CHARACTER, tagName: "fantasy", source: "card", status: "pending" });
  });

  test("the tag carry is scoped to the principal (a foreign ownerId cannot attach onto another library)", async () => {
    const p = ports();
    const ctx = buildImportContext(wiring(p));

    await ctx.attachCardTag({ ownerId: FOREIGN, characterId: CHARACTER, tagName: "fantasy" });

    expect(p.attachCardTag).toHaveBeenCalledWith({ ownerId: OWNER, characterId: CHARACTER, tagName: "fantasy", source: "card", status: "pending" });
  });
});

describe("buildImportContext — the optional ports are OMITTED, never present-as-undefined", () => {
  test("a card-only wiring produces a context with none of the four optional keys", () => {
    const ctx = buildImportContext(wiring(ports()));

    for (const key of ["importLorebook", "linkCarriedBooks", "importCardScripts", "profile"]) {
      expect(Object.hasOwn(ctx, key)).toBe(false);
    }
  });

  test("a supplied optional port is passed through BY IDENTITY (never re-wrapped or re-bound)", () => {
    const importLorebook = vi.fn<NonNullable<ImportContextWiring["importLorebook"]>>();
    const linkCarriedBooks = vi.fn<NonNullable<ImportContextWiring["linkCarriedBooks"]>>();
    const importCardScripts = vi.fn<NonNullable<ImportContextWiring["importCardScripts"]>>();
    const ctx = buildImportContext({ ...wiring(ports()), importLorebook, linkCarriedBooks, importCardScripts });

    expect(ctx.importLorebook).toBe(importLorebook);
    expect(ctx.linkCarriedBooks).toBe(linkCarriedBooks);
    expect(ctx.importCardScripts).toBe(importCardScripts);
    expect(Object.hasOwn(ctx, "profile")).toBe(false);
  });
});
