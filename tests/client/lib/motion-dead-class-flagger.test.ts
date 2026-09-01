import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// INJECTED, never mocked: `definedClassTokens` takes its per-selector tokenizer as a parameter, so the
// throwing arm below is supplied through the real seam instead of faking `@orb/kit/dead-css` (§3).
const tokenize = vi.fn<(selector: string) => readonly string[]>();

const { definedClassTokens, motionFlaggersDrain } = await import("../../../packages/client/src/lib/motion-dead-class-flagger.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  tokenize.mockReset();
});

test("cross-origin CSSOM SecurityError skips only that sheet", () => {
  class FakeGroupingRule {}
  vi.stubGlobal("CSSGroupingRule", FakeGroupingRule);
  vi.stubGlobal("document", {
    styleSheets: [
      {
        get cssRules(): never {
          throw Object.assign(new Error("cross origin"), { name: "SecurityError" });
        },
      },
      { cssRules: [{ selectorText: ".live" }] },
    ],
  });
  tokenize.mockReturnValue(["live"]);
  expect([...definedClassTokens(tokenize)]).toEqual(["live"]);
});

test("selector-tokenizer failure propagates instead of masquerading as cross-origin denial", () => {
  class FakeGroupingRule {}
  vi.stubGlobal("CSSGroupingRule", FakeGroupingRule);
  vi.stubGlobal("document", { styleSheets: [{ cssRules: [{ selectorText: ".broken" }] }] });
  tokenize.mockImplementation(() => {
    throw new Error("planted tokenizer failure");
  });
  expect(() => definedClassTokens(tokenize)).toThrow("planted tokenizer failure");
});

test("a drain refuses loudly before the flagger is installed", async () => {
  await expect(motionFlaggersDrain()).rejects.toThrow("INSTRUMENT ERROR: the motion dead-class flagger is not installed");
});
