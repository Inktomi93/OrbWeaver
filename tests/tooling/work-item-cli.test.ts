import { parseWorkCommand } from "../../scripts/github/work-item.ts";
import { expect, test } from "../support/fixtures.ts";

test("claim requires a lane and produces the mutation intent", () => {
  expect(parseWorkCommand(["claim", "11", "--lane", "docs-catalog"])).toEqual({ kind: "claim", issue: 11, lane: "docs-catalog" });
  expect(() => parseWorkCommand(["claim", "11"])).toThrow("--lane requires a value");
  expect(() => parseWorkCommand(["claim", "11", "--lane", "docs-catalog", "extra"])).toThrow("--lane accepts exactly one value");
});

test("verification and parking cannot omit their evidence contracts", () => {
  expect(parseWorkCommand(["verify", "11", "--evidence", "4 tests passed"])).toEqual({ kind: "verify", issue: 11, evidence: "4 tests passed" });
  expect(() => parseWorkCommand(["done", "11"])).toThrow("--evidence requires a value");
  expect(() => parseWorkCommand(["park", "11"])).toThrow("--wake requires a value");
});

test("block commands carry a real issue relation rather than prose-only status", () => {
  expect(parseWorkCommand(["block", "11", "--by", "7"])).toEqual({ kind: "block", issue: 11, blocker: 7 });
  expect(() => parseWorkCommand(["block", "11", "--by", "not-an-issue"])).toThrow("issue must be a positive numeric issue number");
  expect(() => parseWorkCommand(["block", "0", "--by", "7"])).toThrow("issue must be a positive numeric issue number");
});
