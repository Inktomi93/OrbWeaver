// The local-auth composed test the room-reach suites run on.

import type { Fixtures } from "@orb/testkit/node";
import { test as baseTest } from "@orb/testkit/node";

export const test = baseTest.extend<Pick<Fixtures, "env">>({
  env: async ({}, use): Promise<void> => {
    await use({ ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" });
  },
});
