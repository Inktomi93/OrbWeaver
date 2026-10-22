import { expect, test } from "@playwright/test";
import type { MathStory } from "./_math-stories.tsx";

const STORY = "tests/ui/markdown/_math-stories/MathStory";

for (const trust of ["trusted", "untrusted"] as const) {
  test(`${trust} Markdown renders inline and display math with its actual stylesheet and font`, async ({ mount }) => {
    const component = await mount<typeof MathStory>(STORY, {
      trust,
      mode: "static",
      children: String.raw`Inline $x^2$.

$$
\frac{1}{2}
$$`,
    });
    await expect(component.locator(".katex-html")).toHaveCount(2);
    await expect(component.locator(".katex-html").first()).toBeVisible();
    await expect(component.locator(".katex-display")).toBeVisible();
    await expect(component.locator(".katex").first()).toHaveCSS("font-family", /KaTeX_Main/u);
    const fonts = await component.evaluate(async () => (await document.fonts.load("16px KaTeX_Main")).map((face) => face.status));
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((status) => status === "loaded")).toBe(true);
  });

  test(`${trust} Markdown keeps surrounding prose when an equation is invalid`, async ({ mount }) => {
    const component = await mount<typeof MathStory>(STORY, {
      trust,
      mode: "static",
      children: String.raw`Before the equation.

$$
\frac{1}{
$$

After the equation.`,
    });
    await expect(component.locator(".katex-error")).toBeVisible();
    await expect(component).toContainText("Before the equation.");
    await expect(component).toContainText("After the equation.");
    await expect(component.getByText("Content failed to render.", { exact: true })).toHaveCount(0);
  });
}
