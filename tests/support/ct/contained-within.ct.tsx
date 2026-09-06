// CT: `expectContainedWithin` (contained-within.ts, #1765) — the containment anchor that closes the
// `boundingBox()`-on-a-block-container tautology #1754's regex-section lane found live. Both fixture
// toggles are proven to be caught, and only through the metric each one actually escapes on
// (contained-within-fixtures.tsx's header states which); the non-ancestor arm proves the anchor check
// fires before any measurement, never after.
import { expect, test } from "@playwright/experimental-ct-react";
import { expectContainedWithin } from "./contained-within.ts";
import { ContainmentNonAncestorStory, ContainmentSubjectStory } from "./contained-within-fixtures.tsx";

// A negative-control fixture never settles, so bound the poll tightly instead of eating the default 5s.
const FAST_FAIL = { intervals: [10, 20], timeout: 300 };

test("the correctly-truncated, min-w-0'd subject passes — the positive control", async ({ mount }) => {
  const component = await mount(<ContainmentSubjectStory />);
  await expect(expectContainedWithin(component.getByTestId("containment-subject"), component.getByTestId("containment-wrapper"))).resolves.toBeUndefined();
});

test("PLANTED CONTROL: with `truncate` removed the helper FAILS via scrollWidth", async ({ mount }) => {
  const component = await mount(<ContainmentSubjectStory truncate={false} />);
  await expect(expectContainedWithin(component.getByTestId("containment-subject"), component.getByTestId("containment-wrapper"), FAST_FAIL)).rejects.toThrow(
    /subject overflows wrapper: scrollWidth \d+px/u,
  );
});

test("PLANTED CONTROL: with `min-w-0` removed the helper FAILS via the painted box width", async ({ mount }) => {
  const component = await mount(<ContainmentSubjectStory minW0={false} />);
  await expect(expectContainedWithin(component.getByTestId("containment-subject"), component.getByTestId("containment-wrapper"), FAST_FAIL)).rejects.toThrow(
    /boundingBox width \d+\.\d+px/u,
  );
});

test("PLANTED CONTROL: with BOTH removed the helper still FAILS", async ({ mount }) => {
  const component = await mount(<ContainmentSubjectStory minW0={false} truncate={false} />);
  await expect(expectContainedWithin(component.getByTestId("containment-subject"), component.getByTestId("containment-wrapper"), FAST_FAIL)).rejects.toThrow(
    /subject overflows wrapper/u,
  );
});

test("a non-ancestor wrapper is REFUSED before any measurement runs", async ({ mount }) => {
  const component = await mount(<ContainmentNonAncestorStory />);
  await expect(expectContainedWithin(component.getByTestId("containment-subject"), component.getByTestId("containment-decoy-wrapper"))).rejects.toThrow(
    /WRAPPER is not an ancestor of SUBJECT/u,
  );
});
