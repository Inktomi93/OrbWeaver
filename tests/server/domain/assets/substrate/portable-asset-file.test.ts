// substrate: portable-asset-file — the pure codec for the assets-portability bundle filename + the inline
// `asset:<id>` extractor + the content-hash helper. Load-bearing security surface: `parsePortableAssetFilename`
// is a TRUST BOUNDARY (the name comes off an untrusted uploaded bundle), so the pins are as much about what it
// REJECTS as what it round-trips.

import { assetKindSchema } from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  buildPortableAssetFilename,
  extractInlineAssetIds,
  hashAssetBytes,
  parsePortableAssetFilename,
} from "../../../../../packages/server/src/domain/assets/substrate/portable-asset-file.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const assetId = (): AssetId => mintTypeId(ID_PREFIX.asset);
const HASH_A = "a".repeat(64); // a well-formed (if synthetic) sha-256 hex address.
const SHA256_HEX = /^[0-9a-f]{64}$/;

describe("buildPortableAssetFilename / parsePortableAssetFilename", () => {
  test("round-trips hash + id + kind + mime losslessly (image)", () => {
    const id = assetId();
    const name = buildPortableAssetFilename({
      hash: HASH_A,
      id,
      kind: "avatar",
      mime: "image/png",
    });
    expect(name.endsWith(".png")).toBe(true); // cosmetic ext derived from mime
    const parsed = parsePortableAssetFilename(name);
    expect(parsed).toEqual({ hash: HASH_A, id, kind: "avatar", mime: "image/png" });
  });

  test("round-trips a NON-sniffable document mime (the reason mime travels as hex)", () => {
    const id = assetId();
    const name = buildPortableAssetFilename({
      hash: HASH_A,
      id,
      kind: "document",
      mime: "application/pdf",
    });
    expect(parsePortableAssetFilename(name)?.mime).toBe("application/pdf");
  });

  test("an unknown mime still round-trips (ext falls back to .bin, mime survives via hex)", () => {
    const id = assetId();
    const name = buildPortableAssetFilename({
      hash: HASH_A,
      id,
      kind: "attachment",
      mime: "application/x-weird+thing",
    });
    expect(name.endsWith(".bin")).toBe(true);
    expect(parsePortableAssetFilename(name)?.mime).toBe("application/x-weird+thing");
  });

  test("the id survives its single underscore intact through the __ split", () => {
    const id = assetId();
    expect(id).toContain("_"); // typeid has exactly one `_`; the `__` separator must not split it
    const name = buildPortableAssetFilename({
      hash: HASH_A,
      id,
      kind: "gallery",
      mime: "image/webp",
    });
    expect(parsePortableAssetFilename(name)?.id).toBe(id);
  });

  test("every ASSET_KIND round-trips (kind is carried, not derived)", () => {
    const id = assetId();
    for (const kind of assetKindSchema.options) {
      const name = buildPortableAssetFilename({ hash: HASH_A, id, kind, mime: "image/png" });
      expect(parsePortableAssetFilename(name)?.kind).toBe(kind);
    }
  });

  describe("rejects (returns undefined) — the trust boundary", () => {
    const id = assetId();
    const mimeHex = Buffer.from("image/png", "utf8").toString("hex");

    test("wrong part count", () => {
      expect(parsePortableAssetFilename(`${HASH_A}__${id}.png`)).toBeUndefined();
      expect(parsePortableAssetFilename("just-a-name.png")).toBeUndefined();
    });

    test("a non-hash first segment (not 64 hex)", () => {
      expect(parsePortableAssetFilename(`nothex__${id}__avatar__${mimeHex}.png`)).toBeUndefined();
      expect(parsePortableAssetFilename(`${"a".repeat(63)}__${id}__avatar__${mimeHex}.png`)).toBeUndefined();
    });

    test("an id of the wrong TypeID prefix (a character id smuggled in)", () => {
      const foreign = mintTypeId(ID_PREFIX.character);
      expect(parsePortableAssetFilename(`${HASH_A}__${foreign}__avatar__${mimeHex}.png`)).toBeUndefined();
    });

    test("an unknown asset kind", () => {
      expect(parsePortableAssetFilename(`${HASH_A}__${id}__notakind__${mimeHex}.png`)).toBeUndefined();
    });

    test("a non-hex (or empty) mime segment", () => {
      expect(parsePortableAssetFilename(`${HASH_A}__${id}__avatar__zzzz.png`)).toBeUndefined();
      expect(parsePortableAssetFilename(`${HASH_A}__${id}__avatar__.png`)).toBeUndefined();
    });
  });
});

describe("extractInlineAssetIds", () => {
  test("extracts the id from a chat-canon image ref", () => {
    const id = assetId();
    expect(extractInlineAssetIds(`before ![pic](asset:${id}) after`)).toEqual([id]);
  });

  test("dedups repeated refs and preserves first-seen order", () => {
    const a = assetId();
    const b = assetId();
    const content = `![x](asset:${a}) mid ![y](asset:${b}) end ![z](asset:${a})`;
    expect(extractInlineAssetIds(content)).toEqual([a, b]);
  });

  test("ignores a malformed asset token (not a valid AssetId)", () => {
    expect(extractInlineAssetIds("![x](asset:not-an-id) and asset:asset_short")).toEqual([]);
  });

  test("no refs ⇒ empty", () => {
    expect(extractInlineAssetIds("plain prose, no images")).toEqual([]);
  });
});

describe("hashAssetBytes", () => {
  test("is the sha-256 hex of the bytes (deterministic; matches isAssetHash shape)", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const h = hashAssetBytes(bytes);
    expect(h).toMatch(SHA256_HEX);
    expect(hashAssetBytes(bytes)).toBe(h);
    expect(hashAssetBytes(new Uint8Array([1, 2, 3, 5]))).not.toBe(h);
  });
});
