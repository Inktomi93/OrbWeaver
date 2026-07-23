// substrate: mode — the mode classification guards + the multimodal→extraction fallback map.

import { describe } from "vitest";
import { extractionFallbackFor, isMultimodalMode } from "../../../../../packages/server/src/domain/imagery/substrate/mode.ts";
import { expect, test } from "../../../../support/fixtures";

describe("mode classification", () => {
  test("isMultimodalMode: only the two _multimodal modes", () => {
    expect(isMultimodalMode("character_multimodal")).toBe(true);
    expect(isMultimodalMode("face_multimodal")).toBe(true);
    expect(isMultimodalMode("character")).toBe(false);
    expect(isMultimodalMode("free")).toBe(false);
  });

  test("extractionFallbackFor: a multimodal mode's sibling text mode (no-avatar fallback)", () => {
    expect(extractionFallbackFor("character_multimodal")).toBe("character");
    expect(extractionFallbackFor("face_multimodal")).toBe("face");
  });
});
