import type { HomeTileContribution } from "@orb/client/state";
import { expectTypeOf, test } from "vitest";

declare const base: Pick<HomeTileContribution, "id" | "title" | "icon">;

test("a dormant home tile cannot expose an action", () => {
  const dormant: HomeTileContribution = { ...base, body: { dormant: { reason: "Not built", teaser: "A real subject" } } };
  const live: HomeTileContribution = { ...base, action: "Open", body: () => null };
  // @ts-expect-error a dormant doorway cannot expose an action
  const dishonest: HomeTileContribution = { ...base, action: "Open", body: { dormant: { reason: "Not built", teaser: "A real subject" } } };
  expectTypeOf([dormant, live, dishonest]).toEqualTypeOf<HomeTileContribution[]>();
});

test("a dormant home tile names what is missing and what it promises", () => {
  // @ts-expect-error a doorway with no teaser promises the reader nothing
  const noTeaser: HomeTileContribution = { ...base, body: { dormant: { reason: "Not built" } } };
  // @ts-expect-error a doorway with no reason names nothing that must land first
  const noReason: HomeTileContribution = { ...base, body: { dormant: { teaser: "A real subject" } } };
  expectTypeOf([noTeaser, noReason]).toEqualTypeOf<HomeTileContribution[]>();
});
