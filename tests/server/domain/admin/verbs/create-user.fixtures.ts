// A local-auth root with an owner seed key, a delegated admin and the handle and password each mint uses.

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
      authConfig: { mode: "local", fallback: "deny" },
      rolePolicyConfig: { ["DEFAULT_USER_HANDLE"]: "owner", ["OWNER_HANDLES"]: "owner" },
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
