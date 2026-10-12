import { processMacros } from "@orb/kit/macro";
import { expect, test } from "vitest";

test("macro reads preserve native variable coercion across literal, predicate and mutation paths", () => {
  const env = { list: ["a", "b"], object: { value: "data" }, custom: { toString: (): string => "named" } };
  const options = { char: "C", user: "U", persona: "P", scenario: "S", env };
  expect(processMacros("{{list}}|{{getvar::list}}|{{object}}|{{getvar::custom}}", options)).toBe("a,b|a,b|[object Object]|named");
  expect(processMacros('{{if::custom == "named"}}yes{{else}}no{{/if}}', options)).toBe("yes");
  expect(processMacros("{{addvar::list::,c}}{{getvar::list}}", options)).toBe("a,b,c");
});

test("throwing variable coercion retains the macro failure policy", () => {
  const cause = new Error("variable conversion failed");
  const warnings: unknown[] = [];
  const env = {
    broken: {
      toString: (): string => {
        throw cause;
      },
    },
  };
  const options = {
    char: "C",
    user: "U",
    persona: "P",
    scenario: "S",
    env,
    onWarn: (_message: string, error?: unknown): void => {
      warnings.push(error);
    },
  };
  expect(processMacros("before{{getvar::broken}}after", options)).toBe("before{{getvar}}after");
  expect(warnings).toEqual([cause]);
  expect(() => processMacros("{{broken}}", options)).toThrow(cause);
});
