import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const tokenize = vi.hoisted(() => vi.fn<(selector: string) => readonly string[]>());
vi.mock("@orb/kit/dead-css", () => ({ classTokensInSelector: tokenize, isDeadCssMarkerClass: () => false }));

const { definedClassTokens } = await import("../../../packages/client/src/lib/motion-dead-class-flagger.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  tokenize.mockReset();
});

test("cross-origin CSSOM SecurityError skips only that sheet", () => {
  class FakeGroupingRule {}
  vi.stubGlobal("CSSGroupingRule", FakeGroupingRule);
  vi.stubGlobal("document", {
    styleSheets: [
      { get cssRules(): never { throw Object.assign(new Error("cross origin"), { name: "SecurityError" }); } },
      { cssRules: [{ selectorText: ".live" }] },
    ],
  });
  tokenize.mockReturnValue(["live"]);
  expect([...definedClassTokens()]).toEqual(["live"]);
});

test("selector-tokenizer failure propagates instead of masquerading as cross-origin denial", () => {
  class FakeGroupingRule {}
  vi.stubGlobal("CSSGroupingRule", FakeGroupingRule);
  vi.stubGlobal("document", { styleSheets: [{ cssRules: [{ selectorText: ".broken" }] }] });
  tokenize.mockImplementation(() => {
    throw new Error("planted tokenizer failure");
  });
  expect(() => definedClassTokens()).toThrow("planted tokenizer failure");
});
