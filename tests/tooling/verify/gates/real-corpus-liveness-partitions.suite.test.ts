import { assertLivenessPartitions, partitionLivenessArms, planLivenessBatches } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ALL_ARMS, PARTITIONS } from "./_liveness/runner.ts";

test("independent corpora retain every policy exactly once and never divide an intervention", () => {
  expect(PARTITIONS.every((arms) => arms.length > 0)).toBe(true);
  const ids = PARTITIONS.flat().map((arm) => arm.policy.id);
  expect(ids.toSorted()).toEqual(ALL_ARMS.map((arm) => arm.policy.id).toSorted());
  expect(new Set(ids).size).toBe(ids.length);
  for (const batch of planLivenessBatches(ALL_ARMS)) {
    expect(PARTITIONS.filter((arms) => batch.some((arm) => arms.includes(arm)))).toHaveLength(1);
  }
});

test("full scope refuses missing, duplicate and empty partition policies", () => {
  expect(() => assertLivenessPartitions(ALL_ARMS, PARTITIONS)).not.toThrow();
  const [first, second] = PARTITIONS;
  expect(() => assertLivenessPartitions(ALL_ARMS, [first.slice(1), second])).toThrow("every full-roster policy exactly once");
  expect(() => assertLivenessPartitions(ALL_ARMS, [[...first, ...second], second])).toThrow("every full-roster policy exactly once");
  expect(() => assertLivenessPartitions(ALL_ARMS, [[...first, ...second], []])).toThrow("nonempty corpora");
});

test("a pinned companion keeps its entire ordered intervention in the control corpus", () => {
  const [first, second] = ALL_ARMS;
  if (first === undefined || second === undefined) {
    throw new Error("the partition control requires two real arms");
  }
  const companion = { ...second, overlays: first.overlays };
  const pinned = partitionLivenessArms([first, companion], new Set([companion.policy.id]));
  expect(pinned).toEqual([[first, companion], []]);
  const distinct = { ...second, overlays: [{ kind: "add", path: "packages/kit/src/liveness-distinct.ts", source: "export const distinct = 1;" }] as const };
  expect(planLivenessBatches([first, distinct])).toHaveLength(2);
});
