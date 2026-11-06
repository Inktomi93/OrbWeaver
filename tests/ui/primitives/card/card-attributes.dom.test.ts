// Card's variant axes are classes and `data-*` marks; none of them may reach the DOM as a bare attribute.
import { expect, test } from "@orb/testkit/node";
import { Card } from "@orb/ui/card";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test.for(["div", "button"] as const)("the %s arm keeps padding and shape off the element and marks them as data attributes", (as) => {
  const markup = renderToStaticMarkup(createElement(Card, { as, padding: "none", shape: "row" }, "island"));
  expect(markup).not.toMatch(/\spadding=/u);
  expect(markup).not.toMatch(/\sshape=/u);
  expect(markup).toContain('data-padding="none"');
  expect(markup).toContain('data-shape="row"');
});
