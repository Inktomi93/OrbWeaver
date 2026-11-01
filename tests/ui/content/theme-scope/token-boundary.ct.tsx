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
  TOKENS["color.primary"].cssVar,
  TOKENS["color.background"].cssVar,
  TOKENS["color.user-bubble"].cssVar,
  TOKENS["color.speaker"].cssVar,
  TOKENS["color.dialogue"].cssVar,
  TOKENS["color.narration"].cssVar,
  TOKENS["color.prose-body"].cssVar,
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
      scope.evaluate(
        (element, { colorPrimary, colorUserBubble, colorProseBody, fontSans, radiusCard }) =>
          [colorPrimary, colorUserBubble, colorProseBody, fontSans, radiusCard].map((name) => element.style.getPropertyValue(name)),
        {
          colorPrimary: TOKENS["color.primary"].cssVar,
          colorUserBubble: TOKENS["color.user-bubble"].cssVar,
          colorProseBody: TOKENS["color.prose-body"].cssVar,
          fontSans: TOKENS["font.sans"].cssVar,
          radiusCard: TOKENS["radius.card"].cssVar,
        },
      ),
    )
    .toEqual([LEGAL.accent, LEGAL.userBubble.bg, LEGAL.bodyColor, `${LEGAL.font}, serif`, `var(${TOKENS["radius.full"].cssVar})`]);
});

test("hostile color values drop per field and nested scopes inherit the valid outer accent", async ({ mount }) => {
  const outerTokens = { accent: LEGAL.accent };
  const component = await mount<typeof ThemeBoundaryStory>(STORY, { tokens: LEGAL, outerTokens });
  const scope = component.locator('[data-slot="theme-scope"]').last();
  const sample = component.getByText("Theme boundary reached.", { exact: true });
  await expect(sample).toBeVisible();
  await expect
    .poll(() => scope.evaluate((element, colorPrimary) => element.style.getPropertyValue(colorPrimary), TOKENS["color.primary"].cssVar))
    .toBe(LEGAL.accent);

  for (const value of [
    "url(//theme-boundary.invalid/image)",
    "expression(alert(1))",
    "red; background: url(//theme-boundary.invalid/image)",
    "javascript:alert(1)",
    `var(${TOKENS["color.primary"].cssVar})`,
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
    await expect.poll(() => scope.evaluate((element, colorBorder) => element.style.getPropertyValue(colorBorder), TOKENS["color.border"].cssVar)).toBe("red");
    await expect
      .poll(() => sample.evaluate((element, colorPrimary) => getComputedStyle(element).getPropertyValue(colorPrimary).trim(), TOKENS["color.primary"].cssVar))
      .toBe(LEGAL.accent);
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
    .poll(() =>
      scope.evaluate((element, { colorPrimary, colorRing }) => [colorPrimary, colorRing].map((name) => element.style.getPropertyValue(name)), {
        colorPrimary: TOKENS["color.primary"].cssVar,
        colorRing: TOKENS["color.ring"].cssVar,
      }),
    )
    .toEqual([LEGAL.accent, LEGAL.accent]);
  await expect
    .poll(() =>
      scope.evaluate((element, colorPrimaryForeground) => element.style.getPropertyValue(colorPrimaryForeground), TOKENS["color.primary-foreground"].cssVar),
    )
    .not.toBe("");

  await component.update({ tokens, outerTokens });
  await expect
    .poll(() =>
      scope.evaluate(
        (element, { colorPrimary, colorRing, colorPrimaryForeground }) =>
          [colorPrimary, colorRing, colorPrimaryForeground].map((name) => element.style.getPropertyValue(name)),
        {
          colorPrimary: TOKENS["color.primary"].cssVar,
          colorRing: TOKENS["color.ring"].cssVar,
          colorPrimaryForeground: TOKENS["color.primary-foreground"].cssVar,
        },
      ),
    )
    .toEqual(["", "", ""]);
  await expect
    .poll(() =>
      scope.evaluate((element, { colorSpeaker, colorProseBody }) => [colorSpeaker, colorProseBody].map((name) => element.style.getPropertyValue(name)), {
        colorSpeaker: TOKENS["color.speaker"].cssVar,
        colorProseBody: TOKENS["color.prose-body"].cssVar,
      }),
    )
    .toEqual([tokens.speaker, LEGAL.bodyColor]);
  await expect
    .poll(() => scope.evaluate((element, colorPrimary) => getComputedStyle(element).getPropertyValue(colorPrimary).trim(), TOKENS["color.primary"].cssVar))
    .toBe(outerTokens.accent);
});
