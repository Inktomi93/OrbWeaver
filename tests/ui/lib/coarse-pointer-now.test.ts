// `coarsePointerNow()` (#1182) — the ONE sanctioned `(pointer: coarse)` read, mirroring
// `reduced-motion-now.test.ts`'s posture: a point-in-time, non-reactive read, stubbed by hand rather
// than through a CT because there is no subscription to prove live.
import { coarsePointerNow } from "@orb/ui/lib";
import { afterEach } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const globalWithMatchMedia = globalThis as { matchMedia?: ((query: string) => { matches: boolean }) | undefined };
const originalMatchMedia = globalWithMatchMedia.matchMedia;

afterEach(() => {
  globalWithMatchMedia.matchMedia = originalMatchMedia;
});

test("reads true when the primary pointer is coarse", () => {
  globalWithMatchMedia.matchMedia = (query: string): { matches: boolean } => {
    expect(query).toBe("(pointer: coarse)");
    return { matches: true };
  };
  expect(coarsePointerNow()).toBe(true);
});

test("reads false when the primary pointer is fine", () => {
  globalWithMatchMedia.matchMedia = (): { matches: boolean } => ({ matches: false });
  expect(coarsePointerNow()).toBe(false);
});

test("degrades to false when matchMedia doesn't exist (SSR / non-browser runner)", () => {
  globalWithMatchMedia.matchMedia = undefined;
  expect(coarsePointerNow()).toBe(false);
});
