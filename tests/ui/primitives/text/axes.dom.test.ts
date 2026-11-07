// Text and Heading share one recipe: `clamp` caps and reserves nothing, `lines` caps and reserves, `grow` and `floor` are a flex child's share.
import { expect, test } from "@orb/testkit/node";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function tokensOf(element: ReactElement): readonly string[] {
  return (/class="(?<classes>[^"]*)"/u.exec(renderToStaticMarkup(element))?.groups?.["classes"] ?? "").split(/\s+/u);
}

const text = (props: Parameters<typeof Text>[0]): readonly string[] => tokensOf(createElement(Text, props, "words"));

test.for([1, 2, 3, 4] as const)("clamp %i caps the run at that many lines and reserves none", (lines) => {
  expect(text({ clamp: lines })).toContain(`line-clamp-${String(lines)}`);
  expect(text({ clamp: lines })).not.toContain("orb-lines-2");
});

test("lines caps and reserves, where clamp alone does not", () => {
  expect(text({ lines: 2 })).toEqual(expect.arrayContaining(["line-clamp-2", "whitespace-normal", "orb-lines-2"]));
  expect(text({ clamp: 2 })).not.toContain("whitespace-normal");
  expect(text({})).not.toContain("line-clamp-2");
});

test("a heading clamps through the same recipe", () => {
  expect(tokensOf(createElement(Heading, { level: 2, clamp: 2 }, "name"))).toContain("line-clamp-2");
});

test("grow takes the room that is left, and floor is the width the run starts from", () => {
  expect(text({ grow: true })).toContain("flex-1");
  expect(text({ grow: "content" })).toContain("flex-auto");
  expect(text({ grow: true, floor: "field" })).toEqual(expect.arrayContaining(["flex-1", "basis-(--width-field-floor)"]));
  expect(tokensOf(createElement(Heading, { level: 2, floor: "title" }, "name"))).toContain("basis-(--width-title-floor)");
  expect(text({})).not.toContain("flex-1");
});
