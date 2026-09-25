// @orb/server/kit/abort — the live abort read a `catch` uses to tell a cancel from a fault.

import { isAborted } from "@orb/server/kit/abort";
import { expect, test } from "../../support/fixtures.ts";

test("a signal that fires after the first check reads as aborted on the next call", async () => {
  const controller = new AbortController();
  const { signal } = controller;
  expect(isAborted(signal)).toBe(false);

  await Promise.resolve().then(() => {
    controller.abort();
  });

  expect(isAborted(signal)).toBe(true);
});
