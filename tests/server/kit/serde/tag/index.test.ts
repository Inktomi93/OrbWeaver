// Mirror test for @orb/server/kit/serde/tag — the ONE standalone tag-library serde. Pins BOTH directions: the
// build envelope (schemaKind/schemaVersion + deterministic key order), the parse resilience (foreign/absent
// schemaKind → null, non-JSON → null, a malformed row dropped not fatal, axis coercion), and the
// build -> parse -> build ROUND-TRIP identity (the structural drift guard against the two halves diverging).

import type { CanonicalTag, TagLibrary } from "@orb/server/kit/serde/tag";
import {
  buildTagLibrary,
  parseTagLibrary,
  TAG_LIBRARY_SCHEMA_KIND,
  TAG_LIBRARY_SCHEMA_VERSION,
} from "@orb/server/kit/serde/tag";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

function ctag(over: Partial<CanonicalTag> = {}): CanonicalTag {
  return {
    name: "fantasy",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: null,
    isHiddenOnCard: false,
    ...over,
  };
}

function decode(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

describe("buildTagLibrary", () => {
  test("wraps the tags in the {schemaKind, schemaVersion} envelope", () => {
    const lib: TagLibrary = {
      tags: [ctag({ name: "sci-fi", color: "#123456", source: "manual", sortOrder: 0 })],
    };
    const wire = decode(buildTagLibrary(lib));
    expect(wire["schemaKind"]).toBe(TAG_LIBRARY_SCHEMA_KIND);
    expect(wire["schemaVersion"]).toBe(TAG_LIBRARY_SCHEMA_VERSION);
    const rows = wire["tags"] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      name: "sci-fi",
      color: "#123456",
      color2: null,
      source: "manual",
      folderType: "NONE",
      sortOrder: 0,
      isHiddenOnCard: false,
    });
  });
});

describe("parseTagLibrary", () => {
  test("null for non-JSON bytes", () => {
    expect(parseTagLibrary(new TextEncoder().encode("{not json"))).toBeNull();
    expect(parseTagLibrary(new Uint8Array())).toBeNull();
  });

  test("null for a foreign / absent schemaKind (a different portable file)", () => {
    const foreign = new TextEncoder().encode(
      JSON.stringify({ schemaKind: "orb.persona", schemaVersion: 1, tags: [] }),
    );
    expect(parseTagLibrary(foreign)).toBeNull();
    const noKind = new TextEncoder().encode(JSON.stringify({ tags: [] }));
    expect(parseTagLibrary(noKind)).toBeNull();
  });

  test("a malformed tag row is dropped, not fatal (blank name / non-object)", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        schemaKind: TAG_LIBRARY_SCHEMA_KIND,
        schemaVersion: 1,
        tags: [{ name: "keep" }, { name: "   " }, 42, { color: "#fff" }],
      }),
    );
    const lib = parseTagLibrary(bytes);
    expect(lib?.tags).toHaveLength(1);
    expect(lib?.tags[0]?.name).toBe("keep");
  });

  test("coerces a bad axis to its safe default rather than dropping the row", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        schemaKind: TAG_LIBRARY_SCHEMA_KIND,
        schemaVersion: 1,
        tags: [{ name: "weird", source: "bogus", folderType: "NOPE", isHiddenOnCard: "yes" }],
      }),
    );
    const row = parseTagLibrary(bytes)?.tags[0];
    expect(row).toMatchObject({
      name: "weird",
      source: null,
      folderType: "NONE",
      isHiddenOnCard: false,
    });
  });
});

describe("build -> parse -> build identity", () => {
  test("the serialized bytes are the stable fixed point (all axes populated)", () => {
    const source: TagLibrary = {
      tags: [
        ctag({ name: "noir", color: "#0a0a0a", color2: "#f5f5f5", source: "card", sortOrder: 2 }),
        ctag({ name: "OPEN folder", folderType: "OPEN", isHiddenOnCard: true }),
        ctag({ name: "plain" }),
      ],
    };
    const bytes1 = buildTagLibrary(source);
    const reparsed = parseTagLibrary(bytes1);
    if (reparsed === null) {
      throw new Error("reparse failed");
    }
    const bytes2 = buildTagLibrary(reparsed);
    expect(new TextDecoder().decode(bytes2)).toBe(new TextDecoder().decode(bytes1));
  });
});
