// Card's variant axes are classes and `data-*` marks; none of them may reach the DOM as a bare attribute.
import { expect, test } from "@orb/testkit/node";
import { Card } from "@orb/ui/card";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// One literal per element arm: a union-typed `as` cannot pick an arm of Card's props, whose cap and artDecoration also split.
const RENDER_ARM = {
  div: () => createElement(Card, { as: "div", padding: "none", shape: "row" }, "island"),
  button: () => createElement(Card, { as: "button", padding: "none", shape: "row" }, "island"),
} as const;

test.for(["div", "button"] as const)("the %s arm keeps padding and shape off the element and marks them as data attributes", (as) => {
  const markup = renderToStaticMarkup(RENDER_ARM[as]());
  expect(markup).not.toMatch(/\spadding=/u);
  expect(markup).not.toMatch(/\sshape=/u);
  expect(markup).toContain('data-padding="none"');
  expect(markup).toContain('data-shape="row"');
});
