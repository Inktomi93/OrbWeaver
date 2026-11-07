// @subject packages/client/src/features/workloads/lib/workloads-model.ts
import { expect, test } from "@orb/testkit/node";
import { toProgressView } from "#client/features/workloads/lib/workloads-model.ts";

test("a runner's lower-case progress message is a sentence on every surface, and counts still stand in when it has none", () => {
  expect(toProgressView({ message: "importing ST profiles" })).toEqual({
    pct: null,
    label: "Importing ST profiles",
  });
  expect(toProgressView({ current: 3, total: 12 })).toEqual({ pct: 25, label: "3 of 12" });
});
