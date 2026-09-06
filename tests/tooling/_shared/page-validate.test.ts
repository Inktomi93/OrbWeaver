// The shared PAGE→NODE seam primitives refuse loudly (#1004). Every arm below is a payload a real page
// script can produce — a bridge that vanished mid-run, an older `--ref` bundle answering a different
// shape, a script that threw and returned undefined — and each one used to travel through `as T`.
//
// The NAV RESULT is the load-bearing one: four call sites across three tools cast the same wire shape to
// three separately-declared local interfaces. `ok` decides whether a nav action is reported as failed,
// so an absent `ok` reads as falsy and prints a NAV FAILED that never happened, while a truthy
// non-boolean reports success for a nav that did not land — and a probe that navigated nowhere then
// measures the WRONG SURFACE, which every snap header calls worse than not measuring at all.
import { describe } from "vitest";
import {
  navResultShape,
  pageArray,
  pageBoolean,
  pageBooleanFields,
  pageCount,
  pageNumber,
  pageNumberFields,
  pageNumberInRange,
  pageNumberMap,
  pageObject,
  pageString,
} from "../../../tooling/src/_shared/page-validate.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

describe("the page→node primitives", () => {
  test("each accepts its own kind and refuses every other, naming what it got", () => {
    expect(pageObject({ a: 1 }, "read")).toEqual({ a: 1 });
    expect(() => pageObject(null, "read")).toThrow(/INSTRUMENT ERROR: read returned null, not an object/u);
    expect(() => pageObject([], "read")).toThrow(/returned an array, not an object/u);
    expect(() => pageObject(undefined, "read")).toThrow(/returned nothing, not an object/u);

    expect(pageArray([1], "read")).toEqual([1]);
    expect(() => pageArray({}, "read")).toThrow(/returned object, not a list/u);

    expect(pageBoolean(false, "read")).toBe(false);
    expect(() => pageBoolean("true", "read")).toThrow(/returned string, not a boolean/u);

    expect(pageString("", "read")).toBe("");
    expect(() => pageString(0, "read")).toThrow(/returned number, not a string/u);
  });

  test("a number must be FINITE — a NaN answers false to every budget comparison and reads as a pass", () => {
    expect(pageNumber(0, "read")).toBe(0);
    expect(() => pageNumber(Number.NaN, "read")).toThrow(/not a finite number/u);
    expect(() => pageNumber(Number.POSITIVE_INFINITY, "read")).toThrow(/not a finite number/u);
    expect(() => pageNumber(null, "read")).toThrow(/returned null, not a finite number/u);
  });

  test("the field helpers name the FIELD, not just the read", () => {
    expect(() => pageBooleanFields({ a: true, b: 1 }, ["a", "b"], "read")).toThrow(/read field "b" returned number/u);
    expect(() => pageNumberFields({ a: 1 }, ["a", "b"], "read")).toThrow(/read field "b" returned nothing/u);
  });

  test("a counter map is checked TOTALLY, so a counter added later is covered without an edit", () => {
    expect(pageNumberMap({ a: 1, b: 2 }, "read")).toEqual({ a: 1, b: 2 });
    expect(() => pageNumberMap({ a: 1, addedLater: "3" }, "read")).toThrow(/counter "addedLater" returned string/u);
  });
});

// #1509: `pageNumber` ruled out only NaN, so a negative count, a negative width and an opacity of 12 all
// passed structural validation into `contrastFacts`/`deadCssCensus`, where they are printed as evidence
// and compared against budgets. The two bounded doors below are what those call sites now use; the RANGES
// live at the call sites because only the consumer knows what its own field can legally be.
describe("the bounded number doors", () => {
  test("a count is a NON-NEGATIVE WHOLE number — a negative population and a fractional one both refuse", () => {
    expect(pageCount(0, 'the dead-css census field "sheets"')).toBe(0);
    expect(pageCount(37, "read")).toBe(37);
    expect(() => pageCount(-1, 'the dead-css census field "sheets"')).toThrow(/returned -1, not a non-negative whole count/u);
    expect(() => pageCount(2.5, "read")).toThrow(/returned 2.5, not a non-negative whole count/u);
    // The inherited floor still applies: a count is a number first.
    expect(() => pageCount("7", "read")).toThrow(/returned string, not a finite number/u);
    expect(() => pageCount(Number.NaN, "read")).toThrow(/not a finite number/u);
  });

  test("a range door refuses on both sides and states the range it wanted", () => {
    expect(pageNumberInRange(0.5, "read", { min: 0, max: 1 })).toBe(0.5);
    expect(pageNumberInRange(0, "read", { min: 0, max: 1 })).toBe(0);
    expect(pageNumberInRange(1, "read", { min: 0, max: 1 })).toBe(1);
    expect(() => pageNumberInRange(12, 'the contrast read field "foregroundOpacity"', { min: 0, max: 1 })).toThrow(
      /returned 12, outside the expected range 0\.\.1/u,
    );
    expect(() => pageNumberInRange(-0.2, "read", { min: 0, max: 1 })).toThrow(/outside the expected range 0\.\.1/u);
  });

  test("an OPEN end is a real answer — a length has a floor and no ceiling", () => {
    expect(pageNumberInRange(4096, "read", { min: 0 })).toBe(4096);
    expect(() => pageNumberInRange(-3, 'the contrast read box "width"', { min: 0 })).toThrow(/outside the expected range 0\.\.any/u);
  });

  test("the UNBOUNDED door is unchanged — a negative viewport coordinate is an honest off-screen reading", () => {
    expect(pageNumber(-320, 'the contrast read box "x"')).toBe(-320);
  });
});

describe("the nav bridge result — ONE predicate, four call sites", () => {
  test("both real answers pass through", () => {
    expect(navResultShape({ ok: true }, "nav goto home")).toEqual({ ok: true });
    expect(navResultShape({ ok: false, reason: "no bridge" }, "nav goto home")).toEqual({ ok: false, reason: "no bridge" });
  });

  test("an ABSENT ok is refused — it used to read as falsy and print a failure that never happened", () => {
    expect(() => navResultShape({}, "nav goto home")).toThrow(/nav goto home field "ok" returned nothing, not a boolean/u);
  });

  test("a TRUTHY NON-BOOLEAN ok is refused — the arm that reports success for a nav that never landed", () => {
    expect(() => navResultShape({ ok: "yes" }, "nav goto home")).toThrow(/field "ok" returned string/u);
    expect(() => navResultShape({ ok: 1 }, "nav goto home")).toThrow(/field "ok" returned number/u);
  });

  test("a non-string reason is refused; an absent one is legal", () => {
    expect(() => navResultShape({ ok: false, reason: 42 }, "nav goto home")).toThrow(/field "reason" returned number/u);
    expect(navResultShape({ ok: false }, "nav goto home").reason).toBeUndefined();
  });

  test("the bridge answering nothing at all is refused", () => {
    expect(() => navResultShape(undefined, "nav goto home")).toThrow(/returned nothing, not an object/u);
  });
});
