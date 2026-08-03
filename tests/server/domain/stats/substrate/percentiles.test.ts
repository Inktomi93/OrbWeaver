// substrate/percentiles — pure avg/p50/p90 (nearest-rank). No db, no clock.

import { describe } from "vitest";
import { percentiles } from "../../../../../packages/server/src/domain/stats/substrate/percentiles.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("percentiles", () => {
  test("empty input → all null", () => {
    expect(percentiles([])).toEqual({ avg: null, p50: null, p90: null });
  });

  test("avg + nearest-rank p50/p90 over a sorted copy (input order irrelevant)", () => {
    const p = percentiles([30, 10, 20, 50, 40]); // sorted: 10 20 30 40 50
    expect(p.avg).toBe(30); // 150 / 5
    expect(p.p50).toBe(30); // floor(0.5*5)=2 → index 2
    expect(p.p90).toBe(50); // floor(0.9*5)=4 → index 4
  });

  test("single element → avg=p50=p90=that element", () => {
    expect(percentiles([7])).toEqual({ avg: 7, p50: 7, p90: 7 });
  });
});
