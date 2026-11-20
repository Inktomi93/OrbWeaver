// @subject packages/contracts/src/inference/capability/reads.ts
// Where a token limit comes from, and what that means for a request: a guess holds nothing, a stated or declared limit
// does, and a preset's own Max context tokens outranks a guessed window.
import { contextLimitSource, GENERATION_FLOOR, maxOutputCoversThinking, outputCeilingOf, outputLimitSource, windowForPreset } from "@orb/contracts/inference";
import { makeGenerationCapability } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const STATED_MAX = 32_768;
const STATED_WINDOW = 200_000;
const PRESET_WINDOW = 128_000;
const TRAINED_MAX = 262_144;

const stated = makeGenerationCapability({
  output: { ...GENERATION_FLOOR.output, maxTokens: { min: 1, max: STATED_MAX } },
  context: { window: STATED_WINDOW },
});
const guessed = makeGenerationCapability({
  output: { ...GENERATION_FLOOR.output, maxTokensEstimated: true },
  context: { window: GENERATION_FLOOR.context.window, windowEstimated: true },
});
const declared = makeGenerationCapability({
  output: { ...GENERATION_FLOOR.output, maxTokens: { min: 1, max: STATED_MAX }, maxTokensDeclared: true },
  context: { window: STATED_WINDOW, windowDeclared: true },
});

test("a limit is reported unless a guess or the user's own declaration stands behind it", () => {
  expect([outputLimitSource(stated), contextLimitSource(stated)]).toEqual(["reported", "reported"]);
  expect([outputLimitSource(declared), contextLimitSource(declared)]).toEqual(["override", "override"]);
  expect([outputLimitSource(guessed), contextLimitSource(guessed)]).toEqual(["guessed", "guessed"]);
});

test("a route that sends the window reports its ceiling whatever the window was folded from", () => {
  const sent = makeGenerationCapability({ context: { ...guessed.context, settable: { max: TRAINED_MAX } } });
  expect(contextLimitSource(sent)).toBe("reported");
});

test("only a guessed max output leaves a request unbounded", () => {
  expect(outputCeilingOf(guessed)).toBeUndefined();
  expect(outputCeilingOf(stated)).toBe(STATED_MAX);
  expect(outputCeilingOf(declared)).toBe(STATED_MAX);
});

test("a preset's Max context tokens becomes a guessed window, and a stated window stays", () => {
  const windowed = windowForPreset(guessed, PRESET_WINDOW);
  expect(windowed.context).toEqual({ window: PRESET_WINDOW });
  expect(contextLimitSource(windowed)).toBe("reported");
  expect(windowForPreset(guessed, undefined)).toBe(guessed);
  expect(windowForPreset(stated, PRESET_WINDOW)).toBe(stated);
  expect(windowForPreset(declared, PRESET_WINDOW)).toBe(declared);
});

test("a settable window still runs the preset's number within the trained maximum", () => {
  const settable = makeGenerationCapability({ context: { window: 4096, settable: { max: TRAINED_MAX } } });
  expect(windowForPreset(settable, PRESET_WINDOW).context.window).toBe(PRESET_WINDOW);
  expect(windowForPreset(settable, TRAINED_MAX * 2).context.window).toBe(TRAINED_MAX);
});

test("max output covers the thinking on a model that thinks, except where the wire's SDK adds the thinking budget", () => {
  const thinks = makeGenerationCapability({ reasoning: { mode: "effort", enabled: true } });
  expect(maxOutputCoversThinking(thinks, "openai-compat")).toBe(true);
  expect(maxOutputCoversThinking(thinks, "anthropic-messages")).toBe(false);
  expect(maxOutputCoversThinking(stated, "openai-compat")).toBe(false);
});
