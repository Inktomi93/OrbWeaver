import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ArtRecipesStory } from "./_css-ownership-stories.tsx";

const STORY = "tests/ui/styles/_css-ownership-stories/ArtRecipesStory";

function value(node: Locator, property: string): Promise<string> {
  return node.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

function resolved(node: Locator, property: string, css: string): Promise<string> {
  return node.evaluate(
    (element, [name, expression]) => {
      const probe = document.createElement("div");
      probe.style.setProperty(name, expression);
      element.append(probe);
      const result = getComputedStyle(probe).getPropertyValue(name);
      probe.remove();
      return result;
    },
    [property, css] as const,
  );
}

test("wordmark halo follows the backdrop and art initials follow their size container", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  const halo = root.locator('[data-case="halo"]');
  const shadow = await value(halo, "text-shadow");
  expect(shadow).toBe(await resolved(halo, "text-shadow", TOKENS["text.shadow-wordmark"].value));
  expect(shadow).not.toBe("none");
  for (const [name, token] of [
    ["portrait", "text.art-initial"],
    ["banner", "text.band-initial"],
  ] as const) {
    const initial = root.locator(`[data-case="${name}-initial"]`);
    expect(await value(initial, "font-size")).toBe(await resolved(initial, "font-size", `var(${TOKENS[token].cssVar})`));
    expect(await value(initial, "line-height")).toBe(await value(initial, "font-size"));
  }
  await root.update({ theme: "light" });
  expect(await value(halo, "text-shadow")).toBe(await resolved(halo, "text-shadow", TOKENS["text.shadow-wordmark"].value));
  expect(await value(halo, "text-shadow")).not.toBe(shadow);
});

test("portrait inset is a primitive recipe, not an inline override", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  for (const side of ["start", "end"] as const) {
    const box = root.locator(`[data-case="portrait-${side}"]`);
    expect(await value(box, `padding-inline-${side}`)).toBe(await resolved(box, `padding-inline-${side}`, "var(--art-pane-width)"));
  }
});

test("a speaker tick is a short bar flush to the inline end, sized by the immersive tokens", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  const box = root.locator('[data-case="tick-end"]');
  const tick = (property: string): Promise<string> => box.evaluate((element, name) => getComputedStyle(element, "::after").getPropertyValue(name), property);
  expect(await tick("position")).toBe("absolute");
  expect(await tick("inset-inline-end")).toBe("0px");
  expect(await tick("width")).toBe(await resolved(box, "width", `var(${TOKENS["immersive.stripe-width"].cssVar})`));
  expect(await tick("height")).toBe(await resolved(box, "height", `var(${TOKENS["immersive.tick-length"].cssVar})`));
  expect(await tick("inset-block-start")).toBe(await resolved(box, "inset-block-start", `var(${TOKENS["immersive.tick-offset"].cssVar})`));
  expect(await tick("background-color")).toBe(await resolved(box, "background-color", `var(${TOKENS["color.speaker"].cssVar})`));
});

test("art that rests dimmed takes the token's opacity and returns to full under the pointer", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  const art = root.locator('[data-case="art-dim"]');
  expect(await value(art, "opacity")).toBe(await resolved(art, "opacity", `var(${TOKENS["immersive.whisper-band-opacity"].cssVar})`));
  await art.hover();
  await expect.poll(() => value(art, "opacity")).toBe("1");
});

test("a feather toward the left fades the banner from its right edge", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  const down = await value(root.locator('[data-case="band"]'), "background-image");
  const left = await value(root.locator('[data-case="band-left"]'), "background-image");
  expect(down).not.toMatch(/linear-gradient\((?:270deg|-90deg|to left),/u);
  expect(left).toMatch(/linear-gradient\((?:270deg|-90deg|to left),/u);
});

test("portrait masks mirror and a banner's fallback feather changes when an image loads", async ({ mount }) => {
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  for (const [side, direction] of [
    ["start", /linear-gradient\((?:90deg|to right),/u],
    ["end", /linear-gradient\((?:270deg|-90deg|to left),/u],
  ] as const) {
    const mask = root.locator(`[data-case="mask-${side}"]`);
    expect(await value(mask, "mask-image")).toMatch(direction);
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

test("an indeterminate swatch removes its travelling segment under reduced motion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const root = await mount<typeof ArtRecipesStory>(STORY, {});
  const mark = root.locator('[data-case="hairline"]');
  const content = (): Promise<string> => mark.evaluate((element) => getComputedStyle(element, "::after").content);
  expect(await content()).toBe('""');
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(content).toBe("none");
});
