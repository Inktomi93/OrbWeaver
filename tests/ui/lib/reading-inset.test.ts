// A reading box's inset and the reach that crosses it are one table, so a band reaching across a box ends exactly on its edges.
import { expect, test } from "@orb/testkit/node";
import { Stack } from "@orb/ui/layout";
import { READING_INSET } from "@orb/ui/lib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Inset = (typeof READING_INSET)[keyof typeof READING_INSET]["inset"];

// An inline padding class, after any container variant: `px-*` on both sides or `pe-*` on the end edge.
const INLINE_PADDING = /^(?<variant>(?:@[^:]+:)?)p(?<side>[xe])-/u;

/** The classes that cross and pay back each inline inset a box lays: each inline padding the layout recipe writes for the box's props, and its bleed. */
function reachFor(inset: Inset): readonly string[] {
  const { paddingInline, paddingInlineNarrow, paddingInlineEndNarrow } = inset;
  const markup = renderToStaticMarkup(createElement(Stack, { paddingInline, paddingInlineNarrow, paddingInlineEndNarrow }));
  const classes = (/class="(?<classes>[^"]*)"/u.exec(markup)?.groups?.["classes"] ?? "").split(/\s+/u);
  return classes.flatMap((name) => {
    const match = INLINE_PADDING.exec(name);
    if (match?.groups === undefined) {
      return [];
    }
    const { variant = "", side = "" } = match.groups;
    return [`${variant}-m${side}-${name.slice(match[0].length)}`, name];
  });
}

test.for(Object.entries(READING_INSET))("the %s reach crosses exactly the inline insets the box lays, and pays each back", ([, box]) => {
  expect(new Set(box.reach.split(" "))).toEqual(new Set(reachFor(box.inset)));
});

test("a box's reach is not another box's", () => {
  expect(READING_INSET.plate.reach).not.toBe(READING_INSET.page.reach);
  // The positive control: a drifted inset would fail the pairing above.
  expect(new Set(READING_INSET.plate.reach.split(" "))).not.toEqual(new Set(reachFor(READING_INSET.page.inset)));
});
