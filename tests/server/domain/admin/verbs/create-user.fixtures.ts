// A local-auth root with an owner seed key, a delegated admin and the handle and password each mint uses.

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, DEFAULT_USER_HANDLE_KEY, OWNER_HANDLES_KEY } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { test as base } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

export const PASSWORD = "create-user-synthetic-password";
export const NEW_HANDLE = castId<Handle>("newbie");

export const test = base.extend<{ root: ServerTestHarness }>({
  root: async ({}, use): Promise<void> => {
    await using root = await createServerHarness({
      env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" },
      rolePolicyConfig: { [DEFAULT_USER_HANDLE_KEY]: "owner", [OWNER_HANDLES_KEY]: "owner" },
    });
    await use(root);
  },
});

export async function delegate(root: ServerTestHarness): Promise<{
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
}> {
  const user = await root.actor({ role: "admin" });
  return { principal: await root.principalFor(user.id), caller: await root.internalCallerFor(user.id) };
}
