import { themeOverrideSchema } from "@orb/contracts/theme";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { ThemeBoundaryStory } from "./_boundary-stories.tsx";

const STORY = "tests/ui/content/theme-scope/_boundary-stories/ThemeBoundaryStory";
const LEGAL = {
  accent: TOKENS["color.primary"].value,
  userBubble: { bg: TOKENS["color.user-bubble"].value },
  bodyColor: TOKENS["color.prose-body"].value,
  font: "Georgia",
  radius: "full",
  density: "compact",
} satisfies ThemeScopeTokens;
const COLOR_PROPERTIES = [
  "--color-primary",
  "--color-background",
  "--color-user-bubble",
  "--color-speaker",
  "--color-dialogue",
  "--color-narration",
  "--color-prose-body",
];

test("accepted tokens reach the public scope while obsolete row anatomy stays absent", async ({ mount }) => {
  const tokens = { ...LEGAL, chatStyle: "flat" };
  const component = await mount<typeof ThemeBoundaryStory>(STORY, { tokens });
  const scope = component.locator('[data-slot="theme-scope"]').last();
  await expect(component.getByText("Theme boundary reached.", { exact: true })).toBeVisible();
  await expect(scope).toHaveAttribute("data-density", LEGAL.density);
  await expect(scope).not.toHaveAttribute("data-chat-style");
  await expect
    .poll(() =>
      scope.evaluate((element) =>
        ["--color-primary", "--color-user-bubble", "--color-prose-body", "--font-sans", "--radius-card"].map((name) => element.style.getPropertyValue(name)),
      ),
    )
    .toEqual([LEGAL.accent, LEGAL.userBubble.bg, LEGAL.bodyColor, `${LEGAL.font}, serif`, "var(--radius-full)"]);
});

test("hostile color values drop per field and nested scopes inherit the valid outer accent", async ({ mount }) => {
  const outerTokens = { accent: LEGAL.accent };
  const component = await mount<typeof ThemeBoundaryStory>(STORY, { tokens: LEGAL, outerTokens });
  const scope = component.locator('[data-slot="theme-scope"]').last();
  const sample = component.getByText("Theme boundary reached.", { exact: true });
  await expect(sample).toBeVisible();
  await expect.poll(() => scope.evaluate((element) => element.style.getPropertyValue("--color-primary"))).toBe(LEGAL.accent);

  for (const value of [
    "url(//theme-boundary.invalid/image)",
    "expression(alert(1))",
    "red; background: url(//theme-boundary.invalid/image)",
    "javascript:alert(1)",
    "var(--x)",
    "linear-gradient(red, blue)",
    `#${"a".repeat(200)}`,
  ]) {
    const tokens = {
      accent: value,
      background: value,
      userBubble: { bg: value },
      speaker: value,
      dialogueColor: value,
      narrationColor: value,
      bodyColor: value,
      borderColor: "red",
    };
    const wire = themeOverrideSchema.parse(tokens);
    expect(wire.accent).toBeUndefined();
    expect(wire.borderColor).toBe(tokens.borderColor);
    await component.update({ outerTokens, tokens });
    await expect(sample).toBeVisible();
    await expect
      .poll(() => scope.evaluate((element, names) => names.map((name) => element.style.getPropertyValue(name)), COLOR_PROPERTIES))
      .toEqual(COLOR_PROPERTIES.map(() => ""));
    await expect.poll(() => scope.evaluate((element) => element.style.getPropertyValue("--color-border"))).toBe("red");
    await expect.poll(() => sample.evaluate((element) => getComputedStyle(element).getPropertyValue("--color-primary").trim())).toBe(LEGAL.accent);
  }
});

test("unreadable bare words drop at write, preserve direct render ink and leave derived accents inherited", async ({ mount }) => {
  const tokens = { accent: "notacolorxx", speaker: "notacolorxx", bodyColor: LEGAL.bodyColor };
  expect(themeOverrideSchema.parse(tokens)).toEqual({ accent: undefined, speaker: undefined, bodyColor: LEGAL.bodyColor });
  const outerTokens = { accent: TOKENS["color.foreground"].value };
  const component = await mount<typeof ThemeBoundaryStory>(STORY, { tokens: LEGAL, outerTokens });
  const scope = component.locator('[data-slot="theme-scope"]').last();
  await expect(component.getByText("Theme boundary reached.", { exact: true })).toBeVisible();
  await expect
    .poll(() => scope.evaluate((element) => ["--color-primary", "--color-ring"].map((name) => element.style.getPropertyValue(name))))
    .toEqual([LEGAL.accent, LEGAL.accent]);
  await expect.poll(() => scope.evaluate((element) => element.style.getPropertyValue("--color-primary-foreground"))).not.toBe("");

  await component.update({ tokens, outerTokens });
  await expect
    .poll(() =>
      scope.evaluate((element) => ["--color-primary", "--color-ring", "--color-primary-foreground"].map((name) => element.style.getPropertyValue(name))),
    )
    .toEqual(["", "", ""]);
  await expect
    .poll(() => scope.evaluate((element) => ["--color-speaker", "--color-prose-body"].map((name) => element.style.getPropertyValue(name))))
    .toEqual([tokens.speaker, LEGAL.bodyColor]);
  await expect.poll(() => scope.evaluate((element) => getComputedStyle(element).getPropertyValue("--color-primary").trim())).toBe(outerTokens.accent);
});
