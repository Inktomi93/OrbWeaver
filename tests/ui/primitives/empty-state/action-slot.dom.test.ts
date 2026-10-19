import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { EmptyState } from "@orb/ui/empty-state";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const ACTION_SLOT = 'data-slot="empty-state-action"';

test("a null action renders no action slot, a real action renders inside it", () => {
  const stated = renderToStaticMarkup(createElement(EmptyState, { title: "Nothing here", action: null }));
  expect(stated).toContain('data-slot="empty-state-title"');
  expect(stated).not.toContain(ACTION_SLOT);
  const offered = renderToStaticMarkup(createElement(EmptyState, { title: "Nothing here", action: createElement("button", { type: "button" }, "Go") }));
  expect(offered).toContain(ACTION_SLOT);
  expect(offered).toContain("Go");
});
