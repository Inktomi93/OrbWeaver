// The local-auth composed test the room-reach suites run on.

import type { Fixtures } from "@orb/testkit/node";
import { test as baseTest } from "@orb/testkit/node";

export const test = baseTest.extend<Pick<Fixtures, "authConfig">>({
  authConfig: async ({}, use): Promise<void> => {
    await use({ mode: "local" });
  },
});
