// Names a spec gives the rows it creates, unique within a run without reading the wall clock (Spine-Testing §3).
// Each worker draws from its own seeded band, so a worker Playwright starts after a failure never repeats a name an
// earlier worker left in the mode's database. The band is the one tests/e2e/support/surface-test.ts gives its walk.

import type { SeededIds } from "@orb/testkit/iso";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { test } from "@playwright/test";

const WORKER_ID_BAND = 2 ** 16;
const workerIds = new Map<number, SeededIds>();

/** `<prefix>-<seeded uuid>`, drawn from the calling test's worker band; call it inside a test or hook. */
export function runName(prefix: string): string {
  const { workerIndex } = test.info();
  const ids = workerIds.get(workerIndex) ?? createSeededIds(FIXTURE_ID_CURSOR + workerIndex * WORKER_ID_BAND);
  workerIds.set(workerIndex, ids);
  return `${prefix}-${ids.uuid()}`;
}
