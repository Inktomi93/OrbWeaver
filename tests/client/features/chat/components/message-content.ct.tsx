// CT: the #21 `<speaker>NAME</speaker>` split + per-span `<ThemeScope>` coloring (§12.4). Asserts the
// byte-identical no-op (zero markers → no `ThemeScope`/span wrapper, exactly the pre-#21 single
// `<Markdown>` render) and the tagged-body path (each span gets its own `data-slot="theme-scope"`
// wrapper, in document order, with the text routed to the right span).

import { expect, test } from "@playwright/experimental-ct-react";
import { MessageContentSpansStory } from "../_ct-stories";

const THEME_SCOPE = '[data-slot="theme-scope"]';
const SPANS_CONTAINER = '[data-slot="message-content-spans"]';

test("zero markers: no ThemeScope, no spans container — the byte-identical no-op path", async ({
  mount,
}) => {
  const component = await mount(<MessageContentSpansStory content="Just **plain** markdown." />);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
  await expect(component.locator(SPANS_CONTAINER)).toHaveCount(0);
  await expect(component.getByText("plain")).toBeVisible();
});

test("a single speaker marker wraps its span in one ThemeScope", async ({ mount }) => {
  const component = await mount(
    <MessageContentSpansStory content="<speaker>Alice</speaker>Hello there!" />,
  );
  await expect(component.locator(THEME_SCOPE)).toHaveCount(1);
  await expect(component.getByText("Hello there!")).toBeVisible();
});

test("multiple speaker markers each get their own ThemeScope, in document order", async ({
  mount,
}) => {
  const component = await mount(
    <MessageContentSpansStory content="<speaker>Alice</speaker>Hi!<speaker>Bob</speaker>Hey Alice." />,
  );
  const scopes = component.locator(THEME_SCOPE);
  await expect(scopes).toHaveCount(2);
  // `component` IS the `[data-slot="message-content-spans"]` root itself (the mount point), so its
  // own text — not a re-query for the same selector as a descendant — is what's load-bearing here:
  // Alice's span text must precede Bob's in the rendered DOM.
  const text = await component.innerText();
  expect(text.indexOf("Hi!")).toBeLessThan(text.indexOf("Hey Alice."));
});

test("a preamble before the first marker renders as an un-themed narrator span", async ({
  mount,
}) => {
  const component = await mount(
    <MessageContentSpansStory content="The room falls silent.<speaker>Bob</speaker>Well then." />,
  );
  // One ThemeScope for Bob's span; the preamble span carries no ThemeScope of its own.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(1);
  await expect(component.getByText("The room falls silent.")).toBeVisible();
  await expect(component.getByText("Well then.")).toBeVisible();
});

// ── Macro DISPLAY pass (the `{{char}}`/`{{user}}` bug) ─────────────────────────────────────────────

test("with no renderContext, {{char}}/{{user}} render LITERALLY — the pre-fix default", async ({
  mount,
}) => {
  const component = await mount(
    <MessageContentSpansStory content="{{char}} doesn't look up. So here's the deal, {{user}}:" />,
  );
  await expect(
    component.getByText("{{char}} doesn't look up. So here's the deal, {{user}}:"),
  ).toBeVisible();
});

test("with a renderContext, {{char}}/{{user}} resolve to real names before Markdown", async ({
  mount,
}) => {
  const component = await mount(
    <MessageContentSpansStory
      content="{{char}} doesn't look up. So here's the deal, {{user}}:"
      characterName="Kira"
      userName="Alex"
    />,
  );
  await expect(
    component.getByText("Kira doesn't look up. So here's the deal, Alex:"),
  ).toBeVisible();
  await expect(component.getByText("{{char}}", { exact: false })).toHaveCount(0);
  await expect(component.getByText("{{user}}", { exact: false })).toHaveCount(0);
});
