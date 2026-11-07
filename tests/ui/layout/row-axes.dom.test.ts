// Row's `reverse` reads from the end at every width or below a container step, and `outOfFlow` parks a measured box.
import { expect, test } from "@orb/testkit/node";
import { Row, Stack } from "@orb/ui/layout";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const classesOf = (props: Parameters<typeof Row>[0]): readonly string[] =>
  (/class="(?<classes>[^"]*)"/u.exec(renderToStaticMarkup(createElement(Row, props)))?.groups?.["classes"] ?? "").split(/\s+/u);

test.for(["cq-28", "cq-32", "cq-40", "cq-64"] as const)("reverse %s reverses the row below that container step only", (step) => {
  const reversed = classesOf({ reverse: step });
  expect(reversed).toContain(`@max-${step}:flex-row-reverse`);
  expect(reversed).not.toContain("flex-row-reverse");
  expect(reversed).not.toContain(`@max-${step}:flex-col`);
});

test("reverse true reverses the row at every width, and false leaves its direction", () => {
  expect(classesOf({ reverse: true })).toContain("flex-row-reverse");
  expect(classesOf({ reverse: true })).not.toContain("flex-row");
  expect(classesOf({ reverse: false })).toContain("flex-row");
  expect(classesOf({ reverse: false })).not.toContain("flex-row-reverse");
});

test("passThrough lets the pointer fall through the box, and false leaves it", () => {
  expect(classesOf({ passThrough: true })).toContain("pointer-events-none");
  expect(classesOf({ passThrough: false })).not.toContain("pointer-events-none");
});

test("a reading box's flow overrides the Stack's direction or display, and no flow leaves a column", () => {
  const stackClasses = (props: Parameters<typeof Stack>[0]): readonly string[] =>
    (/class="(?<classes>[^"]*)"/u.exec(renderToStaticMarkup(createElement(Stack, props)))?.groups?.["classes"] ?? "").split(/\s+/u);
  expect(stackClasses({ readingFlow: "weld" })).toContain("flex-row");
  expect(stackClasses({ readingFlow: "weld" })).not.toContain("flex-col");
  expect(stackClasses({ readingFlow: "page" })).toContain("grid");
  expect(stackClasses({ readingFlow: "page" })).not.toContain("flex");
  expect(stackClasses({})).toEqual(expect.arrayContaining(["flex", "flex-col"]));
  expect(stackClasses({ passThrough: true })).toContain("pointer-events-none");
});

test("a row can stack and reverse below different steps", () => {
  expect(classesOf({ stackBelow: "cq-40", reverse: "cq-28" })).toEqual(expect.arrayContaining(["@max-cq-40:flex-col", "@max-cq-28:flex-row-reverse"]));
});

const stackClassesOf = (props: Parameters<typeof Stack>[0]): readonly string[] =>
  (/class="(?<classes>[^"]*)"/u.exec(renderToStaticMarkup(createElement(Stack, props)))?.groups?.["classes"] ?? "").split(/\s+/u);

test.for(["cq-28", "cq-32", "cq-40", "cq-64"] as const)("alignBelow stretch fills the stacked row's width below %s and aligns nothing else", (step) => {
  const classes = classesOf({ stackBelow: step, alignBelow: `stretch-${step}` });
  expect(classes).toEqual(expect.arrayContaining([`@max-${step}:flex-col`, `@max-${step}:items-stretch`]));
  expect(classes).not.toContain(`@max-${step}:items-end`);
  // The positive control: without the axis the row writes no alignment under a step.
  expect(classesOf({ stackBelow: step })).not.toContain(`@max-${step}:items-stretch`);
});

test("alignBelow end packs the stacked row to the end, and leaves the row's own alignment alone", () => {
  const classes = classesOf({ stackBelow: "cq-28", alignBelow: "end-cq-28", align: "center" });
  expect(classes).toEqual(expect.arrayContaining(["@max-cq-28:items-end", "items-center"]));
  expect(classes).not.toContain("@max-cq-28:items-stretch");
});

test.for([
  ["tight", "@max-cq-28:gap-tight"],
  ["field", "@max-cq-28:gap-field"],
  ["row", "@max-cq-28:gap-row"],
] as const)("gapNarrow %s gives the gap up below the phone step on a Row and a Stack, and keeps the gap above it", ([step, narrow]) => {
  expect(classesOf({ gap: "block", gapNarrow: step })).toEqual(expect.arrayContaining(["gap-block", narrow]));
  expect(stackClassesOf({ gap: "block", gapNarrow: step })).toEqual(expect.arrayContaining(["gap-block", narrow]));
  expect(classesOf({ gap: "block" })).not.toContain(narrow);
  expect(stackClassesOf({ gap: "block" })).not.toContain(narrow);
});

test("a Row's reach crosses a message card's edges by their own insets, and a Stack's reach is the inset it crosses", () => {
  expect(classesOf({ reach: "header" })).toEqual(
    expect.arrayContaining(["-ms-(--row-reach-left)", "-me-(--row-reach-right)", "ps-(--row-reach-left)", "pe-(--row-reach-right)"]),
  );
  expect(classesOf({ reach: "foot" })).toEqual(
    expect.arrayContaining(["-ms-(--row-reach-left)", "-me-(--row-reach-right)", "ps-(--row-foot-inset-left)", "pe-(--row-foot-inset-right)"]),
  );
  expect(classesOf({ reach: "header" })).not.toContain("ps-(--row-foot-inset-left)");
  expect(classesOf({ reach: "section" })).toEqual(expect.arrayContaining(["-mx-section", "px-section"]));
  expect(stackClassesOf({ reach: "row" })).toEqual(expect.arrayContaining(["-mx-row", "px-row"]));
});

test("outOfFlow takes the box out of flow, unpainted and unreachable, and false writes nothing", () => {
  expect(classesOf({ outOfFlow: true })).toContain("orb-out-of-flow");
  expect(classesOf({ outOfFlow: false })).not.toContain("orb-out-of-flow");
  expect(classesOf({})).not.toContain("orb-out-of-flow");
});
