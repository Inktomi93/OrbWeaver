// InlineList resets the UA list box, and a padding axis its props type offers must still reach the element.
import { expect, test } from "@orb/testkit/node";
import { InlineList } from "@orb/ui/layout";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function classesOf(props: Parameters<typeof InlineList>[0]): readonly string[] {
  const markup = renderToStaticMarkup(createElement(InlineList, props));
  return /class="(?<classes>[^"]*)"/u.exec(markup)?.groups?.["classes"]?.split(" ") ?? [];
}

test("a list with no padding axis keeps the zero reset", () => {
  expect(classesOf({})).toEqual(expect.arrayContaining(["m-0", "list-none", "p-0"]));
});

test.for([
  [{ padding: "block" }, "p-block"],
  [{ paddingInline: "row" }, "px-row"],
  [{ paddingBlock: "section" }, "py-section"],
] as const)("%j paints its padding over the reset", ([props, expected]) => {
  expect(classesOf(props)).toContain(expected);
});

test("the whole-box padding replaces the reset instead of sitting beside it", () => {
  expect(classesOf({ padding: "block" })).not.toContain("p-0");
});

test("a caller className still has the last word", () => {
  expect(classesOf({ paddingInline: "row", className: "px-field" })).toEqual(expect.arrayContaining(["px-field"]));
  expect(classesOf({ paddingInline: "row", className: "px-field" })).not.toContain("px-row");
});
