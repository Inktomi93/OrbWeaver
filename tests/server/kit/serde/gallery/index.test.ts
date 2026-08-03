// Mirror test for @orb/server/kit/serde/gallery — the ONE gallery-curation serde. Pins BOTH directions: the
// build envelope (schemaKind/schemaVersion + deterministic key order), the parse resilience (foreign/absent
// schemaKind -> null, non-JSON -> null, a malformed row dropped not fatal, the branded assetId gate), and the
// build -> parse -> build ROUND-TRIP identity (the structural drift guard against the two halves diverging),
// including the handle re-link field carried through unchanged.

import type { PortableParse } from "@orb/contracts/portability";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { CanonicalGalleryItem, GalleryExport } from "@orb/server/kit/serde/gallery";
import { buildGallery, GALLERY_SCHEMA_KIND, GALLERY_SCHEMA_VERSION, parseGallery } from "@orb/server/kit/serde/gallery";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

/** The parse outcome's value — the spine returns a typed refusal reason, never null. */
function refusalOf<T>(result: PortableParse<T>): string {
  if (result.ok) {
    throw new Error("expected the file to be refused, but it parsed");
  }
  return result.reason;
}

function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

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
    expect(parseGallery(new TextEncoder().encode("{not json")).ok, "a refused file must not parse").toBe(false);
    expect(refusalOf(parseGallery(new TextEncoder().encode("{not json")))).toBe("not-json");
    expect(parseGallery(new Uint8Array()).ok, "a refused file must not parse").toBe(false);
    expect(refusalOf(parseGallery(new Uint8Array()))).toBe("not-json");
  });

  test("null for a foreign / absent schemaKind (a different portable file)", () => {
    expect(parseGallery(encode({ schemaKind: "orb.tag-library", schemaVersion: 1, items: [] })).ok, "a refused file must not parse").toBe(false);
    expect(refusalOf(parseGallery(encode({ schemaKind: "orb.tag-library", schemaVersion: 1, items: [] })))).toBe("foreign-kind");
    expect(parseGallery(encode({ items: [] })).ok, "a refused file must not parse").toBe(false);
    expect(refusalOf(parseGallery(encode({ items: [] })))).toBe("foreign-kind");
  });

  test("a malformed row is dropped, not fatal (blank / missing assetId, non-object)", () => {
    const bytes = encode({
      schemaKind: GALLERY_SCHEMA_KIND,
      schemaVersion: 1,
      items: [{ assetId: ASSET_A, subjectCharacterHandle: "keep", createdAt: 5 }, { assetId: "" }, 42, { subjectCharacterHandle: "orphan" }],
    });
    const gallery = must(parseGallery(bytes));
    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]?.assetId).toBe(ASSET_A);
    expect(gallery.items[0]?.subjectCharacterHandle).toBe("keep");
  });

  test("coerces a bad handle / createdAt to null rather than dropping the row", () => {
    const bytes = encode({
      schemaKind: GALLERY_SCHEMA_KIND,
      schemaVersion: 1,
      items: [{ assetId: ASSET_A, subjectCharacterHandle: "   ", createdAt: "nope" }],
    });
    const row = must(parseGallery(bytes)).items[0];
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
    const reparsed = must(parseGallery(bytes1));
    if (reparsed === null) {
      throw new Error("reparse failed");
    }
    const bytes2 = buildGallery(reparsed);
    expect(new TextDecoder().decode(bytes2)).toBe(new TextDecoder().decode(bytes1));
  });
});
