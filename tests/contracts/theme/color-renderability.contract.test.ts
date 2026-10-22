import { themeOverrideSchema } from "@orb/contracts/theme";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("the theme write boundary retains resolvable authored fills and contextual direct ink", () => {
  const override = {
    accent: "rgba(100%, 0%, 50%, 40%)",
    background: "oklch(0.7 0.19 40 / 0.55)",
    userBubble: { bg: "#10203080", fg: "currentColor" },
    speaker: "CanvasText",
    borderColor: "burlywood",
  };
  expect(themeOverrideSchema.parse(override)).toEqual(override);
});

test("invalid and contextual derived colors drop per field without discarding valid siblings", () => {
  expect(
    themeOverrideSchema.parse({
      accent: "currentColor",
      background: "notacolorxx",
      userBubble: { bg: "CanvasText", fg: "red" },
      speaker: "rgb(1..2 0 0)",
      dialogueColor: "url(/image)",
      borderColor: "red",
    }),
  ).toEqual({
    accent: undefined,
    background: undefined,
    userBubble: { bg: undefined, fg: "red" },
    speaker: undefined,
    dialogueColor: undefined,
    borderColor: "red",
  });
});
