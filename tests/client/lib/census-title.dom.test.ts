import { censusTitle } from "@orb/client/lib";
import { expect, test } from "@orb/testkit/node";

const LABEL = "Plugin pages";

test("a populated census rides the screen name, counted or formatted, filtered included", () => {
  expect(censusTitle(LABEL, 2)).toBe("Plugin pages · 2");
  expect(censusTitle(LABEL, "2 of 330")).toBe("Plugin pages · 2 of 330");
  // A filter that matches nothing is a statement about the filter, not an empty library.
  expect(censusTitle(LABEL, "0 of 5")).toBe("Plugin pages · 0 of 5");
});

test("a zero, formatted zero or unread census says nothing about size", () => {
  expect(censusTitle(LABEL, 0)).toBeNull();
  expect(censusTitle(LABEL, "0")).toBeNull();
  expect(censusTitle(LABEL, undefined)).toBeNull();
});
