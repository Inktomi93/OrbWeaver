import { expect, test } from "@orb/testkit/node";
import { Button } from "@orb/ui/button";
import { BUTTON_SIZE_OVERFLOW } from "@orb/ui/button/size-hit-area";
import { Stack } from "@orb/ui/layout";
import type { ComponentProps } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Button hit-area metadata is total and matches public Button and Stack output", () => {
  const metadata: Readonly<Record<NonNullable<ComponentProps<typeof Button>["size"]>, boolean>> = BUTTON_SIZE_OVERFLOW;
  for (const size of Object.keys(metadata).filter((key): key is keyof typeof metadata => key in metadata)) {
    const markup = renderToStaticMarkup(createElement(Button, { size, "aria-label": "size contract" }, "control"));
    const tokens = new Set((/class="([^"]*)"/u.exec(markup)?.[1] ?? "").split(/\s+/u));
    expect(markup, size).toContain("<button");
    const overflows = tokens.has("before:h-(--size-touch-target)") || tokens.has("before:size-(--size-touch-target)");
    expect(metadata[size], size).toBe(overflows);
    expect(overflows && !tokens.has("before:absolute"), size).toBe(false);
  }
  expect(renderToStaticMarkup(createElement(Stack, { rows: "control" }))).toContain("*:min-h-(--size-control-sm)");
  expect(renderToStaticMarkup(createElement(Stack))).not.toContain("*:min-h-(--size-control-sm)");
});
