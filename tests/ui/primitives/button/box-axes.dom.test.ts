// Button's own boxes: the `stacked` reshape, the BandButton box, the `width` axis, `stretch` declared after `size` so its inset beats the step's, and the state axes that beat the resting strike and edge.
import { expect, test } from "@orb/testkit/node";
import { BandButton } from "@orb/ui/band-button";
import { Button } from "@orb/ui/button";
import { CONTROL_BLOCK, CONTROL_MIN_BLOCK, CONTROL_SIZES } from "@orb/ui/lib";
import type { ReactElement } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function tokensOf(element: ReactElement): readonly string[] {
  const markup = renderToStaticMarkup(element);
  expect(markup).toContain("<button");
  return (/class="(?<classes>[^"]*)"/u.exec(markup)?.groups?.["classes"] ?? "").split(/\s+/u);
}

const button = (props: Parameters<typeof Button>[0]): readonly string[] => tokensOf(createElement(Button, props, "label"));

test("the band is the sm height with the tight gap and inset, and carries no other step's", () => {
  const band = tokensOf(createElement(BandButton, {}, "label"));
  expect(band).toEqual(expect.arrayContaining(["block-(--size-control-sm)", "gap-tight", "px-tight", "text-label", "leading-label"]));
  expect(band).not.toContain("px-block");
  expect(band).not.toContain("gap-field");
  // The positive control: the sm step beside it keeps the block inset and the field gap.
  expect(button({ size: "sm" })).toEqual(expect.arrayContaining(["px-block", "gap-field"]));
});

test("the band is a ghost unless its call site says otherwise", () => {
  expect(tokensOf(createElement(BandButton, {}, "label"))).not.toContain("border-tone-edge");
  expect(tokensOf(createElement(BandButton, { variant: "outline" }, "label"))).toContain("border-tone-edge");
});

test.for(CONTROL_SIZES)("stacked at %s is a start-aligned column whose height follows its lines, floored at the step", (size) => {
  const stacked = button({ size, stacked: true });
  expect(stacked).toEqual(expect.arrayContaining(["flex-col", "items-start", "p-row", "block-auto", ...CONTROL_MIN_BLOCK[size].split(" ")]));
  expect(stacked).not.toContain(CONTROL_BLOCK[size]);
  expect(stacked).not.toContain("px-block");
  // The positive control: the same step unstacked is a fixed height in a row.
  expect(button({ size })).not.toContain("flex-col");
  expect(button({ size })).not.toContain("block-auto");
});

test("width full is the parent's whole inline size", () => {
  expect(button({ width: "full" })).toContain("inline-full");
  expect(button({})).not.toContain("inline-full");
});

test("a whole list line keeps the field inset over the step's, and a row door writes no inset", () => {
  const line = button({ size: "sm", stretch: "line" });
  expect(line).toEqual(expect.arrayContaining(["px-field", "inline-full"]));
  expect(line).not.toContain("px-block");
  const row = button({ size: "sm", stretch: "row" });
  expect(row).toEqual(expect.arrayContaining(["flex-1", "min-inline-0", "px-block"]));
  expect(row).not.toContain("px-field");
  expect(row).not.toContain("inline-full");
});

const STRETCHED = { row: button({ stretch: "row" }), line: button({ stretch: "line" }) } as const;

test.for(Object.entries(STRETCHED))(
  "a %s-stretched button sets its label at the start, from one axis, and an unstretched one keeps its centre",
  ([, tokens]) => {
    expect(tokens).toEqual(expect.arrayContaining(["justify-start", "text-start"]));
    expect(tokens.filter((token) => token.startsWith("justify-"))).toEqual(["justify-start"]);
    expect(tokens.filter((token) => token === "text-start")).toHaveLength(1);
    expect(button({})).not.toContain("justify-start");
    expect(button({ justify: "start" })).toEqual(expect.arrayContaining(["justify-start", "text-start"]));
  },
);

test("a negated selection keeps its strike over a dotted underline, and a rail keeps its start edge over a reserved edge", () => {
  const negated = button({ selection: "negated", underline: "dotted" });
  expect(negated).toContain("line-through");
  expect(negated).not.toContain("underline");
  const rail = button({ selection: "rail", reserveEdge: true });
  expect(rail).toEqual(expect.arrayContaining(["border", "border-s-rule"]));
  // The positive controls: each axis alone writes its own class.
  expect(button({ underline: "dotted" })).toContain("underline");
  expect(button({ selection: "rail" })).not.toContain("border");
});
