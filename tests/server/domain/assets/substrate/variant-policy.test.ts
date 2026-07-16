// substrate: snapBlobWidth — the variant-width ladder (esoterica #2: a DoS defense — the per-hash keyspace
// is bounded to |BLOB_WIDTHS|). Pins: below-first → first rung; exact rung; between → next rung up;
// oversized → top rung; non-usable widths → undefined (the route 404s them).

import { describe } from "vitest";
import { BANNER_WIDTHS, BLOB_WIDTHS, snapBannerWidth, snapBlobWidth } from "../../../../../packages/server/src/domain/assets/substrate/variant-policy.ts";
import { expect, test } from "../../../../support/fixtures";

describe("snapBlobWidth", () => {
  test("snaps to the smallest rung >= the request", () => {
    expect(snapBlobWidth(1)).toBe(48);
    expect(snapBlobWidth(48)).toBe(48);
    expect(snapBlobWidth(49)).toBe(64);
    expect(snapBlobWidth(96)).toBe(96);
    expect(snapBlobWidth(200)).toBe(240);
  });

  test("an oversized ask snaps to the top rung (caps the keyspace)", () => {
    const top = BLOB_WIDTHS.at(-1);
    expect(snapBlobWidth(401)).toBe(top);
    expect(snapBlobWidth(100_000)).toBe(top);
  });

  test("non-usable widths return undefined (the route 404s)", () => {
    expect(snapBlobWidth(0)).toBeUndefined();
    expect(snapBlobWidth(-10)).toBeUndefined();
    expect(snapBlobWidth(Number.NaN)).toBeUndefined();
    expect(snapBlobWidth(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

// The banner (3:1, face-safe smart-crop) ladder — Whisper's header-art band. `BANNER_WIDTHS = [480, 800]`;
// 3:1 ⇒ height = width / 3.
describe("snapBannerWidth", () => {
  test("snaps to the smallest rung >= the request, deriving the 3:1 height", () => {
    expect(snapBannerWidth(1)).toEqual({ width: 480, height: 160 });
    expect(snapBannerWidth(480)).toEqual({ width: 480, height: 160 });
    expect(snapBannerWidth(481)).toEqual({ width: 800, height: 267 });
  });

  test("an oversized ask snaps to the top rung (caps the keyspace)", () => {
    const top = BANNER_WIDTHS.at(-1);
    expect(snapBannerWidth(100_000)).toEqual({ width: top, height: 267 });
  });

  test("non-usable widths return undefined (the route 404s)", () => {
    expect(snapBannerWidth(0)).toBeUndefined();
    expect(snapBannerWidth(-10)).toBeUndefined();
    expect(snapBannerWidth(Number.NaN)).toBeUndefined();
    expect(snapBannerWidth(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
