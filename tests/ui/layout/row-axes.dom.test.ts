// Row's `reverseBelow` reads from the end below a container step, and `outOfFlow` parks a measured box.
import { expect, test } from "@orb/testkit/node";
import { Row } from "@orb/ui/layout";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const classesOf = (props: Parameters<typeof Row>[0]): readonly string[] =>
  (/class="(?<classes>[^"]*)"/u.exec(renderToStaticMarkup(createElement(Row, props)))?.groups?.["classes"] ?? "").split(/\s+/u);

test.for(["cq-28", "cq-32", "cq-40", "cq-64"] as const)("reverseBelow %s reverses the row below that container step only", (step) => {
  const reversed = classesOf({ reverseBelow: step });
  expect(reversed).toContain(`@max-${step}:flex-row-reverse`);
  expect(reversed).not.toContain("flex-row-reverse");
  expect(reversed).not.toContain(`@max-${step}:flex-col`);
});

test("a row can stack and reverse below different steps", () => {
  expect(classesOf({ stackBelow: "cq-40", reverseBelow: "cq-28" })).toEqual(expect.arrayContaining(["@max-cq-40:flex-col", "@max-cq-28:flex-row-reverse"]));
});

test("outOfFlow takes the box out of flow, unpainted and unreachable, and false writes nothing", () => {
  expect(classesOf({ outOfFlow: true })).toContain("orb-out-of-flow");
  expect(classesOf({ outOfFlow: false })).not.toContain("orb-out-of-flow");
  expect(classesOf({})).not.toContain("orb-out-of-flow");
});
