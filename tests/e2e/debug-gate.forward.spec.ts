// E2E (FORWARD-HEADER): the /api/_debug token states, and a signed SSO identity as the door's credential.
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { actorViaHeader } from "./support/actors.ts";
import { ALL_ADMITTED, debugOutcomes, describeDebugTokenStates, gateRefusalReason, RELAYED } from "./support/debug-gate.ts";

describeDebugTokenStates("forward-header");

// Relayed, so the operator's own loopback session cannot be what opens the door.
test("a signed forward-header SSO OWNER authorizes (via:'header' is a credential)", async ({ baseURL }) => {
  const owner = await actorViaHeader(baseURL ?? "", { handle: castId<Handle>("owner"), sub: "sub-owner" });
  expect((await owner.whoami()).role).toBe("owner");
  expect(await debugOutcomes(baseURL ?? "", { ...RELAYED, ...owner.headers })).toEqual(ALL_ADMITTED);
});

test("a signed forward-header SSO USER is refused (the role gate binds the header arm)", async ({ baseURL }) => {
  const user = await actorViaHeader(baseURL ?? "", { handle: castId<Handle>("debug-gate-sso-user"), sub: "sub-debug-gate-sso-user" });
  expect((await user.whoami()).role).toBe("user");
  expect(await gateRefusalReason(baseURL ?? "", { ...RELAYED, ...user.headers })).toEqual(expect.any(String));
});
