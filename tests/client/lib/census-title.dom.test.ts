import { censusTitle } from "@orb/client/lib";
import { SECTION_LABELS } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/node";

const LABEL = SECTION_LABELS.extensions;

test("a populated census rides the screen name, counted or formatted, filtered included", () => {
  expect(censusTitle(LABEL, 2)).toStrictEqual({ name: LABEL, census: 2 });
  expect(censusTitle(LABEL, "2 of 330")).toStrictEqual({ name: LABEL, census: "2 of 330" });
  // A filter that matches nothing is a statement about the filter, not an empty library.
  expect(censusTitle(LABEL, "0 of 5")).toStrictEqual({ name: LABEL, census: "0 of 5" });
});

test("a zero or unread census says nothing about size", () => {
  expect(censusTitle(LABEL, 0)).toBeNull();
  expect(censusTitle(LABEL, undefined)).toBeNull();
});
