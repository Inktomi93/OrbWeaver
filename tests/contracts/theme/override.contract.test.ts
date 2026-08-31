// The ThemeOverride WIRE clamp (D44 §12.1 / themes-design §3.1): safe values pass, injection
// vectors DEGRADE per-field (never a whole-blob reject — the lenient posture), unknown keys strip.

import { themeOverrideSchema } from "@orb/contracts/theme";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("themeOverrideSchema (the wire clamp)", () => {
  test("a full safe override round-trips", () => {
    const full = {
      accent: "oklch(0.76 0.145 66)",
      userBubble: { bg: "#223344", fg: "oklch(0.95 0.006 75)" },
      aiBubble: { bg: "rgb(20, 20, 24)", fg: "white" },
      speaker: "hsl(66, 50%, 60%)",
      dialogueColor: "oklch(0.95 0.006 75)",
      narrationColor: "oklch(0.78 0.02 70)",
      bodyColor: "oklch(0.9 0.008 72)",
      font: "Georgia",
      radius: "card",
      background: "oklch(0.175 0.012 65)",
      density: "compact",
    };
    expect(themeOverrideSchema.parse(full)).toEqual(full);
  });

  test("injection vectors DEGRADE per-field; the rest of the blob survives", () => {
    const parsed = themeOverrideSchema.parse({
      accent: "url(https://evil.example/x)", // → drops
      font: "Comic Sans MS", // off-allowlist → drops
      density: "roomy", // off-enum → drops
      bodyColor: "red", // safe → survives
    });
    expect(parsed.accent).toBeUndefined();
    expect(parsed.font).toBeUndefined();
    expect(parsed.density).toBeUndefined();
    expect(parsed.bodyColor).toBe("red");
  });

  test("unknown keys strip; an empty override is valid", () => {
    const parsed = themeOverrideSchema.parse({ evilKnob: "x" });
    expect(parsed).toEqual({});
    expect(themeOverrideSchema.parse({})).toEqual({});
  });

  test("derived fills reject contextual colors while inherited inks and direct borders keep them", () => {
    const parsed = themeOverrideSchema.parse({
      accent: "LinkText",
      background: "currentColor",
      userBubble: { bg: "ActiveText", fg: "currentColor" },
      aiBubble: { bg: "notacolorxx", fg: "CanvasText" },
      speaker: "currentColor",
      dialogueColor: "LinkText",
      narrationColor: "CanvasText",
      bodyColor: "ActiveText",
      borderColor: "ButtonText",
    });

    expect(parsed.accent).toBeUndefined();
    expect(parsed.background).toBeUndefined();
    expect(parsed.userBubble).toEqual({ bg: undefined, fg: "currentColor" });
    expect(parsed.aiBubble).toEqual({ bg: "notacolorxx", fg: "CanvasText" });
    expect(parsed.speaker).toBe("currentColor");
    expect(parsed.dialogueColor).toBe("LinkText");
    expect(parsed.narrationColor).toBe("CanvasText");
    expect(parsed.bodyColor).toBe("ActiveText");
    expect(parsed.borderColor).toBe("ButtonText");
  });

  test("standard named derived fills survive the wire clamp, including burlywood", () => {
    expect(
      themeOverrideSchema.parse({
        accent: "burlywood",
        background: "rebeccapurple",
        userBubble: { bg: "papayawhip" },
      }),
    ).toEqual({ accent: "burlywood", background: "rebeccapurple", userBubble: { bg: "papayawhip" } });
  });
});
