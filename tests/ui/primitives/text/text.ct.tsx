// CT: the text/heading seal — token size/tone land as computed style (asserted via TOKENS, never a
// literal — gate ui-primitive-structure clause 5), and <Heading> renders a REAL semantic h1-h6 while
// <Text> renders its body intrinsic (the a11y/semantic-element correctness the seal exists for).

import { Heading, Text } from "@orb/ui/text";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

// Computed `font-size` resolves to px, while the DTCG size tokens are authored in rem. Derive the
// expected px straight from the TOKENS value (root = 16px — the stack.ct gap-token precedent) so the
// assertion stays token-driven, never a hardcoded rem/px literal (contract §4.2 spirit).
const ROOT_PX = 16;
const sizePx = (path: "text.body" | "text.label" | "text.title" | "text.code"): string =>
  `${Number.parseFloat(TOKENS[path].value) * ROOT_PX}px`;

test("Text body default lands the body size + foreground tone tokens on a <p>", async ({
  mount,
}) => {
  const text = await mount(<Text>hello</Text>);
  await expect(text).toHaveCSS("font-size", sizePx("text.body"));
  await expect(text).toHaveCSS("color", TOKENS["color.foreground"].value);
  const tag = await text.evaluate((el) => el.tagName.toLowerCase());
  expect(tag).toBe("p");
});

test("Text size=label tone=muted rides the label + muted-foreground tokens (the route-stub case)", async ({
  mount,
}) => {
  const text = await mount(
    <Text size="label" tone="muted">
      auth isn’t wired yet.
    </Text>,
  );
  await expect(text).toHaveCSS("font-size", sizePx("text.label"));
  await expect(text).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("Text as=span/div renders the requested intrinsic (polymorphic body element)", async ({
  mount,
}) => {
  const span = await mount(<Text as="span">inline</Text>);
  expect(await span.evaluate((el) => el.tagName.toLowerCase())).toBe("span");
  await span.unmount();
  const div = await mount(<Text as="div">block</Text>);
  expect(await div.evaluate((el) => el.tagName.toLowerCase())).toBe("div");
});

test("Heading level renders the matching REAL h1-h6 tag", async ({ mount, page }) => {
  await mount(
    <div>
      {([1, 2, 3, 4, 5, 6] as const).map((level) => (
        <Heading key={level} level={level}>
          rank {level}
        </Heading>
      ))}
    </div>,
  );
  // One real h1..h6 exists per level (a styled <div> heading would fail these role/tag lookups).
  const tags = await page.evaluate(() =>
    [1, 2, 3, 4, 5, 6].map((n) => document.querySelectorAll(`h${n}`).length),
  );
  expect(tags).toEqual([1, 1, 1, 1, 1, 1]);
});

test("Heading defaults ride the title size token (the flat hierarchy-by-weight scale)", async ({
  mount,
}) => {
  const heading = await mount(<Heading level={1}>admin</Heading>);
  await expect(heading).toHaveCSS("font-size", sizePx("text.title"));
  await expect(heading).toHaveCSS("color", TOKENS["color.foreground"].value);
  // Default weight is semibold — heavier than a body <Text>'s regular (hierarchy carried by weight).
  const weight = await heading.evaluate((el) => getComputedStyle(el).fontWeight);
  expect(Number(weight)).toBe(600);
});

test("Heading accent tone swaps to the primary token", async ({ mount }) => {
  const heading = await mount(
    <Heading level={2} tone="accent">
      Section
    </Heading>,
  );
  await expect(heading).toHaveCSS("color", TOKENS["color.primary"].value);
});

test("code size rides the code token and switches to the mono font stack", async ({ mount }) => {
  const text = await mount(<Text size="code">const x = 1;</Text>);
  await expect(text).toHaveCSS("font-size", sizePx("text.code"));
  const family = await text.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family.toLowerCase()).toContain("mono");
});
