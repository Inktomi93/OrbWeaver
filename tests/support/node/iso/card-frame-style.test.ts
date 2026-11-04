// @subject tests/support/iso/card-frame-style.ts

import { CARD_FRAME_STYLE_TOKEN, clampCardFrameStyleTokens } from "@orb/kit/card-frame";
import { expect, test } from "vitest";
import { IN_RANGE_CARD_FRAME_STYLE } from "../../iso/card-frame-style.ts";

test("the slice names every closed style token and the production clamp keeps each value unchanged", () => {
  expect(Object.keys(IN_RANGE_CARD_FRAME_STYLE).toSorted()).toEqual(Object.values(CARD_FRAME_STYLE_TOKEN).toSorted());
  expect(clampCardFrameStyleTokens(IN_RANGE_CARD_FRAME_STYLE)).toEqual(IN_RANGE_CARD_FRAME_STYLE);
});
