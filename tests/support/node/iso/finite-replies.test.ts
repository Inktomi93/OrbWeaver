import { finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "vitest";

test("a plan answers in order, peeks without spending and refuses past the end", () => {
  using plan = finiteReplies("ordered", ["first", "second"]);
  expect(plan.peek()).toBe("first");
  expect(plan.take()).toBe("first");
  expect(plan.take()).toBe("second");
  expect(plan.peek()).toBeUndefined();
  expect(() => plan.take()).toThrow("the ordered reply plan is exhausted");
});

test("leaving a plan's scope refuses replies left and names how many", () => {
  expect(() => {
    using plan = finiteReplies("spare", ["spent", "left", "left too"]);
    plan.take();
  }).toThrow("the spare reply plan left 2 of 3 replies unused");
});

test("a falsy reply counts as a reply", () => {
  expect(() => {
    using plan = finiteReplies("falsy", [0, ""]);
    expect(plan.take()).toBe(0);
  }).toThrow("the falsy reply plan left 1 of 2 replies unused");
});
