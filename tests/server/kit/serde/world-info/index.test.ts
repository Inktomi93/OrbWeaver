// Mirror test for @orb/server/kit/serde/world-info — the ONE standalone world-info-book serde core
// (W-worldinfo). Pins BOTH directions: build emits the `{schemaKind, version}` envelope + every canonical
// field; parse rejects non-JSON / a wrong `schemaKind` / a mistyped field to null (the isolated per-file
// failure, never a throw); and the build->parse->build ROUND-TRIP identity (the structural drift guard
// against the two halves diverging).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import {
  buildWorldBookFile,
  parseWorldBookFile,
  WORLD_INFO_SCHEMA_KIND,
} from "@orb/server/kit/serde/world-info";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

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
    const parsed = JSON.parse(buildWorldBookFile(book())) as Record<string, unknown>;
    expect(parsed["schemaKind"]).toBe(WORLD_INFO_SCHEMA_KIND);
    expect(parsed["version"]).toBe(1);
    expect(parsed["name"]).toBe("Aria's World");
    expect((parsed["entries"] as unknown[]).length).toBe(2);
  });
});

describe("parseWorldBookFile", () => {
  test("round-trips the canonical shape (keys, metadata blob, and the null/empty fields all survive)", () => {
    const canonical = parseWorldBookFile(buildWorldBookFile(book()));
    expect(canonical).toEqual(book());
  });

  test("null for non-JSON text", () => {
    expect(parseWorldBookFile("{not json")).toBeNull();
    expect(parseWorldBookFile("")).toBeNull();
  });

  test("null for a wrong schemaKind (a foreign file is not silently imported)", () => {
    const wrong = JSON.stringify({
      schemaKind: "some-other-format",
      version: 1,
      name: "x",
      entries: [],
    });
    expect(parseWorldBookFile(wrong)).toBeNull();
  });

  test("null for a structurally-wrong entry (a mistyped field fails the shape schema)", () => {
    const bad = JSON.stringify({
      schemaKind: WORLD_INFO_SCHEMA_KIND,
      version: 1,
      name: "x",
      description: null,
      entries: [{ title: "t", content: 42 }],
    });
    expect(parseWorldBookFile(bad)).toBeNull();
  });
});

describe("build -> parse -> build identity", () => {
  test("the serialized JSON text is the stable fixed point", () => {
    const source = book();
    const text1 = buildWorldBookFile(source);
    const reparsed = parseWorldBookFile(text1);
    if (reparsed === null) {
      throw new Error("round-trip parse returned null");
    }
    expect(buildWorldBookFile(reparsed)).toBe(text1);
  });
});
