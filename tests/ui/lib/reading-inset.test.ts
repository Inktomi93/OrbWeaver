// A reading box's inset and the reach that crosses it are one table, so a band reaching across a box ends exactly on its edges.
import { expect, test } from "@orb/testkit/node";
import { READING_INSET } from "@orb/ui/lib";

const PHONE = "@max-cq-28:";

type Inset = (typeof READING_INSET)[keyof typeof READING_INSET]["inset"];

/** The classes that cross and pay back each inline inset a box lays: a bleed and its padding, per step and per phone edge. */
function reachFor(inset: Inset): readonly string[] {
  return [
    `-mx-${inset.paddingInline}`,
    `px-${inset.paddingInline}`,
    ...(inset.paddingInlineNarrow === undefined ? [] : [`${PHONE}-mx-${inset.paddingInlineNarrow}`, `${PHONE}px-${inset.paddingInlineNarrow}`]),
    ...(inset.paddingInlineEndNarrow === undefined ? [] : [`${PHONE}-me-${inset.paddingInlineEndNarrow}`, `${PHONE}pe-${inset.paddingInlineEndNarrow}`]),
  ];
}

test.for(Object.entries(READING_INSET))("the %s reach crosses exactly the inline insets the box lays, and pays each back", ([, box]) => {
  expect(new Set(box.reach.split(" "))).toEqual(new Set(reachFor(box.inset)));
});

test("a box's reach is not another box's", () => {
  expect(READING_INSET.plate.reach).not.toBe(READING_INSET.page.reach);
  // The positive control: a drifted inset would fail the pairing above.
  expect(new Set(READING_INSET.plate.reach.split(" "))).not.toEqual(new Set(reachFor(READING_INSET.page.inset)));
});
