// substrate: metadata — the write-seam coercion. `null` (explicit clear) passes through; a loose write
// record is narrowed to the typed shape (known fields typed, unknown tail preserved); an invalid known
// field throws at the write seam (the strict parse) rather than silently storing garbage.

import { describe, expect, test } from "vitest";
import { normalizeWriteMetadata } from "../../../../../packages/server/src/domain/persona/substrate/metadata.ts";

describe("normalizeWriteMetadata", () => {
  test("null passes straight through", () => {
    expect(normalizeWriteMetadata(null)).toBeNull();
  });

  test("narrows a valid record and preserves the loose tail", () => {
    const out = normalizeWriteMetadata({ descriptionPosition: "in_prompt", custom: 42 });
    expect(out?.descriptionPosition).toBe("in_prompt");
    expect(out?.["custom"]).toBe(42);
  });

  test("throws on an invalid known field (bad placement enum)", () => {
    expect(() => normalizeWriteMetadata({ descriptionPosition: "sideways" })).toThrow();
  });
});
