import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ArtRecipesStory } from "./_css-ownership-stories.tsx";

const STORY = "tests/ui/styles/_css-ownership-stories/ArtRecipesStory";

function value(node: Locator, property: string): Promise<string> {
  return node.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

function resolved(node: Locator, property: string, token: string): Promise<string> {
  return node.evaluate(
    (element, [name, variable]) => {
      const probe = document.createElement("div");
      probe.style.setProperty(name, `var(${variable})`);
      element.append(probe);
      const result = getComputedStyle(probe).getPropertyValue(name);
      probe.remove();
      return result;
    },
    [property, token] as const,
  );
}

test("wordmark halo follows the backdrop and art initials follow their size container", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  const halo = root.locator('[data-case="halo"]');
  const shadow = await value(halo, "text-shadow");
  expect(shadow).toBe(await resolved(halo, "text-shadow", TOKENS["shadow.wordmark"].cssVar));
  expect(shadow).not.toBe("none");
  for (const [name, token] of [
    ["portrait", "text.art-initial"],
    ["banner", "text.band-initial"],
  ] as const) {
    const initial = root.locator(`[data-case="${name}-initial"]`);
    expect(await value(initial, "font-size")).toBe(await resolved(initial, "font-size", TOKENS[token].cssVar));
    expect(await value(initial, "line-height")).toBe(await value(initial, "font-size"));
  }
  await root.update({ theme: "light" });
  expect(await value(halo, "text-shadow")).toBe(await resolved(halo, "text-shadow", TOKENS["shadow.wordmark"].cssVar));
  expect(await value(halo, "text-shadow")).not.toBe(shadow);
});

test("portrait inset and speaker edges are primitive recipes, not inline overrides", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  for (const side of ["start", "end"] as const) {
    const box = root.locator(`[data-case="portrait-${side}"]`);
    expect(await value(box, `padding-inline-${side}`)).toBe(await resolved(box, `padding-inline-${side}`, "--art-pane-width"));
  }
  for (const [name, side] of [
    ["top", "block-start"],
    ["start", "inline-start"],
  ] as const) {
    const box = root.locator(`[data-case="stripe-${name}"]`);
    expect(await value(box, `border-${side}-width`)).toBe(await resolved(box, `border-${side}-width`, TOKENS["immersive.stripe-width"].cssVar));
    expect(await value(box, `border-${side}-style`)).toBe("solid");
  }
});

test("portrait masks mirror and a banner's fallback feather changes when an image loads", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  for (const [side, direction] of [
    ["start", "right"],
    ["end", "left"],
  ] as const) {
    const mask = root.locator(`[data-case="mask-${side}"]`);
    expect(await value(mask, "mask-image")).toContain(`to ${direction}`);
    expect(await value(mask, "mask-composite")).toContain("intersect");
  }
  const band = root.locator('[data-case="band"]');
  const fallback = await value(band, "background-image");
  expect(fallback).toContain("55%");
  expect(fallback).toContain("100%");
  await root.update({ image: true });
  const image = await value(band, "background-image");
  expect(image).toContain("grain.svg");
  expect(image).toContain(TOKENS["immersive.whisper-feather"].value);
  expect(image).not.toBe(fallback);
});
