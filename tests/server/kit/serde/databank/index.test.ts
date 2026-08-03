// Mirror test for @orb/server/kit/serde/databank — the ONE orb-native databank-document serde (F1's serde
// half). Pins BOTH directions: build stamps the envelope + every canon/provenance field + the two
// re-linkable scopes; parse refuses a foreign/newer file by name and coerces the soft fields; and the
// build->parse->build ROUND-TRIP identity.
//
// The load-bearing assertion is that `importHash` TRAVELS: it is the `(ownerId, importHash)` dedup key, so a
// file that dropped it would turn every re-import into a duplicate library.

import type { PortableParse } from "@orb/contracts/portability";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CanonicalDocument } from "@orb/server/kit/serde/databank";
import { buildDocumentFile, DATABANK_SCHEMA_KIND, parseDocumentFile } from "@orb/server/kit/serde/databank";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const ENC = new TextEncoder();
const DEC = new TextDecoder();
const ASSET = castId<AssetId>("asset_source_blob");

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

function doc(over: Partial<CanonicalDocument> = {}): CanonicalDocument {
  return {
    name: "Field Notes.pdf",
    mime: "application/pdf",
    origin: "upload",
    sourceUrl: null,
    extractedText: "the canon text",
    importHash: "abc123",
    byteSize: 4096,
    extractorVersion: "pdf-1",
    createdAt: 1_700_000_000_000,
    sourceAssetId: ASSET,
    global: true,
    characterHandles: ["hero", "villain"],
    ...over,
  };
}

describe("buildDocumentFile", () => {
  test("emits the envelope + the canon, the provenance, and the two re-linkable scopes", () => {
    const wire = JSON.parse(DEC.decode(buildDocumentFile(doc()))) as Record<string, unknown>;
    expect(wire["schemaKind"]).toBe(DATABANK_SCHEMA_KIND);
    expect(wire["schemaVersion"]).toBe(1);
    expect(wire["extractedText"]).toBe("the canon text");
    // The dedup key TRAVELS — without it a re-import duplicates the whole library.
    expect(wire["importHash"]).toBe("abc123");
    expect(wire["sourceAssetId"]).toBe(ASSET);
    expect(wire["global"]).toBe(true);
    expect(wire["characterHandles"]).toEqual(["hero", "villain"]);
  });

  test("nothing DERIVED travels — no chunk counts, no embeddings, no ingest state", () => {
    const wire = JSON.parse(DEC.decode(buildDocumentFile(doc()))) as Record<string, unknown>;
    for (const derived of ["chunkCount", "embeddedCount", "chunks", "ingestState"]) {
      expect(wire).not.toHaveProperty(derived);
    }
  });
});

describe("parseDocumentFile", () => {
  test("round-trips the canonical shape (a scrape with no blob, no scopes)", () => {
    const source = doc({ origin: "web", sourceUrl: "https://example.test/a", sourceAssetId: null, global: false, characterHandles: [] });
    expect(must(parseDocumentFile(buildDocumentFile(source)))).toEqual(source);
  });

  test("refuses a foreign kind, non-JSON, and a NEWER writer — each by its own reason", () => {
    expect(refusalOf(parseDocumentFile(ENC.encode("{nope")))).toBe("not-json");
    expect(refusalOf(parseDocumentFile(ENC.encode(JSON.stringify({ schemaKind: "orb.theme", schemaVersion: 1 }))))).toBe("foreign-kind");
    const future = ENC.encode(JSON.stringify({ ...doc(), schemaKind: DATABANK_SCHEMA_KIND, schemaVersion: 99 }));
    expect(refusalOf(parseDocumentFile(future))).toBe("newer-version");
  });

  test("a hostile / absent soft field coerces rather than failing the document (the canon is what matters)", () => {
    const bytes = ENC.encode(
      JSON.stringify({
        schemaKind: DATABANK_SCHEMA_KIND,
        schemaVersion: 1,
        name: "Notes",
        mime: "text/plain",
        origin: "text",
        extractedText: "body",
        importHash: "h",
        byteSize: 4,
        extractorVersion: "none",
        global: "yes",
        characterHandles: "not-an-array",
      }),
    );
    const parsed = must(parseDocumentFile(bytes));
    expect(parsed.global).toBe(false);
    expect(parsed.characterHandles).toEqual([]);
    expect(parsed.sourceUrl).toBeNull();
    expect(parsed.sourceAssetId).toBeNull();
    expect(parsed.createdAt).toBeNull();
  });

  test("a document missing its CANON is refused — extractedText is not optional", () => {
    const bytes = ENC.encode(
      JSON.stringify({
        schemaKind: DATABANK_SCHEMA_KIND,
        schemaVersion: 1,
        name: "x",
        mime: "text/plain",
        origin: "text",
        importHash: "h",
        byteSize: 0,
        extractorVersion: "none",
      }),
    );
    expect(refusalOf(parseDocumentFile(bytes))).toBe("malformed");
  });
});

describe("build -> parse -> build identity", () => {
  test("the serialized bytes are the stable fixed point (all fields populated)", () => {
    const bytes1 = buildDocumentFile(doc());
    const bytes2 = buildDocumentFile(must(parseDocumentFile(bytes1)));
    expect(DEC.decode(bytes2)).toBe(DEC.decode(bytes1));
  });
});
