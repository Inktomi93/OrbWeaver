import type { SeededIds } from "@orb/testkit/iso";
import { expect, test } from "vitest";
import { asymmetric } from "@orb/testkit/iso";

test("type-only door import", () => {
  const ids: SeededIds | null = null;
  expect({ ids, at: 1 }).toEqual({ ids: null, at: asymmetric(expect.any(Number)) });
});
