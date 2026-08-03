// substrate: size — the semantic size presets + the per-mode default (imagery-design/02 §6). Substrate lands
// with I1; the request-passing rides I2 (doc 05 FORK 2), so this pins the shape the runner will read.

import { describe } from "vitest";
import { defaultSizeFor, SIZE_PRESETS } from "../../../../../packages/server/src/domain/imagery/substrate/size.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("SIZE_PRESETS", () => {
  test("the gpt-image-1 published dimensions", () => {
    expect(SIZE_PRESETS.square).toEqual({ width: 1024, height: 1024 });
    expect(SIZE_PRESETS.portrait).toEqual({ width: 1024, height: 1536 });
    expect(SIZE_PRESETS.landscape).toEqual({ width: 1536, height: 1024 });
  });
});

describe("defaultSizeFor", () => {
  test("face/character (+ multimodal) → portrait", () => {
    expect(defaultSizeFor("character")).toBe("portrait");
    expect(defaultSizeFor("face")).toBe("portrait");
    expect(defaultSizeFor("character_multimodal")).toBe("portrait");
    expect(defaultSizeFor("face_multimodal")).toBe("portrait");
  });

  test("scenario/background → landscape; free → square", () => {
    expect(defaultSizeFor("scenario")).toBe("landscape");
    expect(defaultSizeFor("background")).toBe("landscape");
    expect(defaultSizeFor("free")).toBe("square");
  });
});
