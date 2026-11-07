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

test("outOfFlow takes the box out of flow, unpainted and unreachable, and false writes nothing", () => {
  expect(classesOf({ outOfFlow: true })).toContain("orb-out-of-flow");
  expect(classesOf({ outOfFlow: false })).not.toContain("orb-out-of-flow");
  expect(classesOf({})).not.toContain("orb-out-of-flow");
});
