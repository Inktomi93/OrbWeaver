// Mirror test for @orb/server/kit/serde/gallery — the ONE gallery-curation serde. Pins BOTH directions: the
// build envelope (schemaKind/schemaVersion + deterministic key order), the parse resilience (foreign/absent
// schemaKind -> null, non-JSON -> null, a malformed row dropped not fatal, the branded assetId gate), and the
// build -> parse -> build ROUND-TRIP identity (the structural drift guard against the two halves diverging),
// including the handle re-link field carried through unchanged.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { CanonicalGalleryItem, GalleryExport } from "@orb/server/kit/serde/gallery";
import { buildGallery, GALLERY_SCHEMA_KIND, GALLERY_SCHEMA_VERSION, parseGallery } from "@orb/server/kit/serde/gallery";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

const ASSET_A = mintTypeId(ID_PREFIX.asset);
const ASSET_B = mintTypeId(ID_PREFIX.asset);

function citem(over: Partial<CanonicalGalleryItem> = {}): CanonicalGalleryItem {
  return {
    assetId: ASSET_A,
    subjectCharacterHandle: null,
    createdAt: 1000,
    ...over,
  };
}

function decode(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe("buildGallery", () => {
  test("wraps the curation rows in the {schemaKind, schemaVersion} envelope", () => {
    const gallery: GalleryExport = {
      items: [citem({ assetId: ASSET_B, subjectCharacterHandle: "aria", createdAt: 42 })],
    };
    const wire = decode(buildGallery(gallery));
    expect(wire["schemaKind"]).toBe(GALLERY_SCHEMA_KIND);
    expect(wire["schemaVersion"]).toBe(GALLERY_SCHEMA_VERSION);
    const rows = wire["items"] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      assetId: ASSET_B,
      subjectCharacterHandle: "aria",
      createdAt: 42,
    });
  });
});

describe("parseGallery", () => {
  test("null for non-JSON bytes", () => {
    expect(parseGallery(new TextEncoder().encode("{not json"))).toBeNull();
    expect(parseGallery(new Uint8Array())).toBeNull();
  });

  test("null for a foreign / absent schemaKind (a different portable file)", () => {
    expect(parseGallery(encode({ schemaKind: "orb.tag-library", schemaVersion: 1, items: [] }))).toBeNull();
    expect(parseGallery(encode({ items: [] }))).toBeNull();
  });

  test("a malformed row is dropped, not fatal (blank / missing assetId, non-object)", () => {
    const bytes = encode({
      schemaKind: GALLERY_SCHEMA_KIND,
      schemaVersion: 1,
      items: [{ assetId: ASSET_A, subjectCharacterHandle: "keep", createdAt: 5 }, { assetId: "" }, 42, { subjectCharacterHandle: "orphan" }],
    });
    const gallery = parseGallery(bytes);
    expect(gallery?.items).toHaveLength(1);
    expect(gallery?.items[0]?.assetId).toBe(ASSET_A);
    expect(gallery?.items[0]?.subjectCharacterHandle).toBe("keep");
  });

  test("coerces a bad handle / createdAt to null rather than dropping the row", () => {
    const bytes = encode({
      schemaKind: GALLERY_SCHEMA_KIND,
      schemaVersion: 1,
      items: [{ assetId: ASSET_A, subjectCharacterHandle: "   ", createdAt: "nope" }],
    });
    const row = parseGallery(bytes)?.items[0];
    expect(row).toEqual({ assetId: ASSET_A, subjectCharacterHandle: null, createdAt: null });
  });
});

describe("build -> parse -> build identity", () => {
  test("the serialized bytes are the stable fixed point (handle re-link + un-charactered rows)", () => {
    const source: GalleryExport = {
      items: [
        citem({ assetId: ASSET_A, subjectCharacterHandle: "hero", createdAt: 100 }),
        citem({ assetId: ASSET_B, subjectCharacterHandle: null, createdAt: 200 }),
        citem({ assetId: ASSET_A, subjectCharacterHandle: "villain", createdAt: null }),
      ],
    };
    const bytes1 = buildGallery(source);
    const reparsed = parseGallery(bytes1);
    if (reparsed === null) {
      throw new Error("reparse failed");
    }
    const bytes2 = buildGallery(reparsed);
    expect(new TextDecoder().decode(bytes2)).toBe(new TextDecoder().decode(bytes1));
  });
});
