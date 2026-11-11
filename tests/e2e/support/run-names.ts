// Names a spec gives the rows it creates, without reading the wall clock (Spine-Testing §3). The run token keeps a
// name apart from every earlier run's rows, which a dev-target run's database still holds; the worker band keeps
// it apart from every other name in this run.

import type { SeededIds } from "@orb/testkit/iso";
import { test } from "@playwright/test";
import { E2E_RUN_TOKEN } from "./modes.ts";
import { workerIds } from "./worker-ids.ts";

const bands = new Map<number, SeededIds>();

/** `<prefix>-<run token>-<seeded uuid>`, drawn from the calling test's worker band; call it inside a test or hook. */
export function runName(prefix: string): string {
  const { workerIndex } = test.info();
  const ids = bands.get(workerIndex) ?? workerIds(workerIndex);
  bands.set(workerIndex, ids);
  return `${prefix}-${E2E_RUN_TOKEN}-${ids.uuid()}`;
}
