// Button's own boxes: the `band` and `stacked` steps, the `width` axis, and `stretch` declared after `size` so its inset beats the step's.
import { expect, test } from "@orb/testkit/node";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function tokensOf(element: ReactElement): readonly string[] {
  const markup = renderToStaticMarkup(element);
  expect(markup).toContain("<button");
  return (/class="(?<classes>[^"]*)"/u.exec(markup)?.groups?.["classes"] ?? "").split(/\s+/u);
}

const button = (props: Parameters<typeof Button>[0]): readonly string[] => tokensOf(createElement(Button, props, "label"));

test("the band step is the sm height with the tight gap and inset, and the sm step's own inset is gone", () => {
  const band = button({ size: "band" });
  expect(band).toEqual(expect.arrayContaining(["block-(--size-control-sm)", "gap-tight", "px-tight", "text-label", "leading-label"]));
  expect(band).not.toContain("px-block");
  expect(band).not.toContain("gap-field");
  // The positive control: the sm step beside it keeps the block inset and the field gap.
  expect(button({ size: "sm" })).toEqual(expect.arrayContaining(["px-block", "gap-field"]));
});

test("the stacked step is a start-aligned column that floors at the sm height and fixes none", () => {
  const stacked = button({ size: "stacked" });
  expect(stacked).toEqual(
    expect.arrayContaining(["flex-col", "items-start", "px-row", "py-row", "block-auto", "min-block-(--size-control-sm)", "text-label", "leading-label"]),
  );
  expect(stacked).not.toContain("block-(--size-control-sm)");
  expect(stacked).not.toContain("px-block");
});

test("width full is the parent's whole inline size", () => {
  expect(button({ width: "full" })).toContain("inline-full");
  expect(button({})).not.toContain("inline-full");
});

test("a whole list line keeps the field inset over the step's, and a row door writes no inset", () => {
  const line = button({ size: "sm", stretch: "line" });
  expect(line).toEqual(expect.arrayContaining(["px-field", "text-start", "inline-full"]));
  expect(line).not.toContain("px-block");
  const row = button({ size: "sm", stretch: "row" });
  expect(row).toEqual(expect.arrayContaining(["flex-1", "justify-start", "min-inline-0", "px-block"]));
  expect(row).not.toContain("px-field");
});
