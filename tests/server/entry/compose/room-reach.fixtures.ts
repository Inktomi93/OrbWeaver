// The local-auth composed test the room-reach suites run on.

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { Fixtures } from "@orb/testkit/node";
import { test as baseTest } from "@orb/testkit/node";

export const test = baseTest.extend<Pick<Fixtures, "env">>({
  env: async ({}, use): Promise<void> => {
    await use({ [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" });
  },
});
