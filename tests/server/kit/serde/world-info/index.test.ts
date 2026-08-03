// Mirror test for @orb/server/kit/serde/world-info — the ONE standalone world-info-book serde core
// (W-worldinfo). Pins BOTH directions: build emits the uniform `{schemaKind, schemaVersion}` envelope +
// every canonical field; parse REFUSES non-JSON / a wrong `schemaKind` / a mistyped entry with a typed
// reason (the isolated per-file failure, never a throw); the ACCEPT-OLD-FOREVER arm still reads a book
// written with the legacy `version` key; and the build->parse->build ROUND-TRIP identity holds.
//
// `reject-file` is this family's DECLARED rowPolicy (O-8 opt-in): one bad entry fails the whole book,
// because a lorebook that restores LOOKING complete while silently missing an entry is the worse outcome.

import type { PortableParse } from "@orb/contracts/portability";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import { buildWorldBookFile, parseWorldBookFile, WORLD_INFO_SCHEMA_KIND } from "@orb/server/kit/serde/world-info";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

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

const ENC = new TextEncoder();

function book(over: Partial<BulkImportLorebookInput> = {}): BulkImportLorebookInput {
  return {
    name: "Aria's World",
    description: "the lore",
    entries: [
      {
        title: "The Kingdom",
        description: "a memo",
        content: "A realm of eternal dusk.",
        keys: ["kingdom", "realm"],
        enabled: true,
        priority: 10,
        ignoreBudget: false,
        metadata: { scopeMode: "always", vendorTail: { keep: 1 } },
      },
      {
        title: "The River",
        description: null,
        content: "It never freezes.",
        keys: [],
        enabled: false,
        priority: -5,
        ignoreBudget: true,
        metadata: null,
      },
    ],
    ...over,
  };
}

describe("buildWorldBookFile", () => {
  test("emits the envelope + a self-describing JSON object", () => {
    const parsed = JSON.parse(new TextDecoder().decode(buildWorldBookFile(book()))) as Record<string, unknown>;
    expect(parsed["schemaKind"]).toBe(WORLD_INFO_SCHEMA_KIND);
    // Build emits the UNIFORM key; the legacy `version` spelling is parse-only (external artifacts).
    expect(parsed["schemaVersion"]).toBe(1);
    expect(parsed["version"]).toBeUndefined();
    expect(parsed["name"]).toBe("Aria's World");
    expect((parsed["entries"] as unknown[]).length).toBe(2);
  });
});

describe("parseWorldBookFile", () => {
  test("round-trips the canonical shape (keys, metadata blob, and the null/empty fields all survive)", () => {
    const canonical = must(parseWorldBookFile(buildWorldBookFile(book())));
    expect(canonical).toEqual(book());
  });

  test("null for non-JSON text", () => {
    expect(refusalOf(parseWorldBookFile(ENC.encode("{not json")))).toBe("not-json");
    expect(refusalOf(parseWorldBookFile(ENC.encode("")))).toBe("not-json");
  });

  test("null for a wrong schemaKind (a foreign file is not silently imported)", () => {
    const wrong = JSON.stringify({
      schemaKind: "some-other-format",
      version: 1,
      name: "x",
      entries: [],
    });
    expect(refusalOf(parseWorldBookFile(ENC.encode(wrong)))).toBe("foreign-kind");
  });

  test("null for a structurally-wrong entry (a mistyped field fails the shape schema)", () => {
    const bad = JSON.stringify({
      schemaKind: WORLD_INFO_SCHEMA_KIND,
      version: 1,
      name: "x",
      description: null,
      entries: [{ title: "t", content: 42 }],
    });
    expect(refusalOf(parseWorldBookFile(ENC.encode(bad)))).toBe("malformed");
  });
});

describe("accept-old-forever (external artifacts)", () => {
  test("a book written with the LEGACY `version` key still parses (NO-LEGACY governs the db, not a user's file)", () => {
    const legacy = JSON.stringify({
      schemaKind: WORLD_INFO_SCHEMA_KIND,
      version: 1,
      name: "Old Book",
      description: null,
      entries: [],
    });
    expect(must(parseWorldBookFile(ENC.encode(legacy))).name).toBe("Old Book");
  });

  test("a book from a NEWER writer is REFUSED by name, not half-parsed with today's semantics", () => {
    const future = JSON.stringify({
      schemaKind: WORLD_INFO_SCHEMA_KIND,
      schemaVersion: 99,
      name: "From The Future",
      description: null,
      entries: [],
    });
    expect(refusalOf(parseWorldBookFile(ENC.encode(future)))).toBe("newer-version");
  });
});

describe("build -> parse -> build identity", () => {
  test("the serialized JSON text is the stable fixed point", () => {
    const source = book();
    const bytes1 = buildWorldBookFile(source);
    const bytes2 = buildWorldBookFile(must(parseWorldBookFile(bytes1)));
    expect(new TextDecoder().decode(bytes2)).toBe(new TextDecoder().decode(bytes1));
  });
});
