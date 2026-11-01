// @subject packages/server/src/domain/discovery/substrate/hub-math.ts
// The CSLS hub math runs in the worker's own process: a large group must not hold the event loop for the length of
// the pass, must stop when the run is cancelled, and must score the same on both strategies.
import { setImmediate as nextTurn } from "node:timers/promises";
import { expect, test } from "@orb/testkit/node";
import { computeGroupHubs, HUB_YIELD_WORK_BUDGET } from "#server/domain/discovery/substrate/hub-math.ts";

const DIM = 48;

/** Deterministic, distinct, non-degenerate vectors. */
function vectors(count: number): Float32Array[] {
  return Array.from({ length: count }, (_, row) => Float32Array.from({ length: DIM }, (__, col) => Math.abs(Math.sin(row * 12.9898 + col * 78.233)) + 0.25));
}

/** Counts the event-loop turns other work gets while `pass` runs. */
async function turnsDuring(pass: () => Promise<unknown>): Promise<number> {
  let turns = 0;
  const state = { running: true };
  const ticker = (async (): Promise<void> => {
    while (state.running) {
      await nextTurn();
      turns += 1;
    }
  })();
  try {
    await pass();
  } finally {
    state.running = false;
  }
  await ticker;
  return turns;
}

test("a large group gives the event loop a turn for every work budget it spends, on both strategies", async () => {
  const group = vectors(2000);
  const pairs = (group.length * (group.length - 1)) / 2;
  const minimumTurns = Math.floor((pairs * DIM) / HUB_YIELD_WORK_BUDGET);
  expect(minimumTurns).toBeGreaterThan(8);

  let dense: number[] = [];
  const denseTurns = await turnsDuring(async () => {
    dense = await computeGroupHubs(group, { denseMax: group.length });
  });
  let streaming: number[] = [];
  const streamingTurns = await turnsDuring(async () => {
    streaming = await computeGroupHubs(group, { denseMax: 0 });
  });

  expect(denseTurns).toBeGreaterThanOrEqual(minimumTurns);
  expect(streamingTurns).toBeGreaterThanOrEqual(minimumTurns);
  expect(streaming).toEqual(dense);
  expect(new Set(dense).size).toBeGreaterThan(1);
});

test("a single row longer than one work budget still yields inside the row, with the same scores", async () => {
  const wideDim = 131_072;
  const group = Array.from({ length: 64 }, (_, row) =>
    Float32Array.from({ length: wideDim }, (__, col) => Math.abs(Math.sin(row * 12.9898 + col * 78.233)) + 0.25),
  );
  // One row alone costs 2 * wideDim * 64 units, over two budgets, so a yield per row is not enough.
  const rowUnits = group.length * wideDim * 2;
  expect(rowUnits).toBeGreaterThan(2 * HUB_YIELD_WORK_BUDGET);
  const minimumTurns = 2 * group.length;

  let streaming: number[] = [];
  const turns = await turnsDuring(async () => {
    streaming = await computeGroupHubs(group, { denseMax: 0 });
  });
  expect(turns).toBeGreaterThanOrEqual(minimumTurns);
  expect(streaming).toEqual(await computeGroupHubs(group, { denseMax: group.length }));
}, 60_000);

test("a cancelled run stops at the next yield instead of finishing the group", async () => {
  const controller = new AbortController();
  const group = vectors(2000);
  const pass = computeGroupHubs(group, { denseMax: 0, signal: controller.signal });
  await nextTurn();
  controller.abort(new Error("cancelled by test"));
  await expect(pass).rejects.toThrow("cancelled by test");
});
