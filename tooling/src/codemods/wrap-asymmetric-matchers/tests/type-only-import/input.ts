import type { SeededIds } from "@orb/testkit/iso";
import { expect, test } from "vitest";

test("type-only door import", () => {
  const ids: SeededIds | null = null;
  expect({ ids, at: 1 }).toEqual({ ids: null, at: expect.any(Number) });
});
