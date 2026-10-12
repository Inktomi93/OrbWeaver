// @orb/server/primitives/abort — the live abort read a `catch` uses to tell a cancel from a fault.

import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { isAborted } from "#server/primitives/abort/index.ts";

test("a signal that fires after the first check reads as aborted on the next call", async () => {
  const controller = new AbortController();
  const { signal } = controller;
  expect(isAborted(signal)).toBe(false);

  await Promise.resolve().then(() => {
    controller.abort();
  });

  expect(isAborted(signal)).toBe(true);
});
