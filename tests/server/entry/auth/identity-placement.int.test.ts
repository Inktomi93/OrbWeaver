// D1/D40/D135: verification supplies pre-row identity; the real HTTP seam resolves the stored role.
// @subject packages/server/src/entry/auth/seam.ts
// @subject packages/server/src/infra/auth/modes/forward-header.ts
import {
  AUTH_FALLBACK_KEY,
  AUTH_MODE_KEY,
  authMeSchema,
  DEFAULT_USER_HANDLE_KEY,
  FORWARD_AUTH_TRUSTED_PROXIES_KEY,
  OWNER_HANDLES_KEY,
} from "@orb/contracts/identity";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { isAdmin, isOwner } from "@orb/testkit/node/auth";
import { createServerHarness, damageOwnerRow, readAccounts } from "@orb/testkit/node/composed";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

test("the real header seam hands sessions a pre-row identity and never trusts forged userId or role headers", async () => {
  await using root = await createServerHarness({
    env: { [FORWARD_AUTH_TRUSTED_PROXIES_KEY]: "127.0.0.1/32", [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" },
    physicalPeer: () => "127.0.0.1",
  });
  const provision = vi.spyOn(root.app.sessions, "provisionIdentity");
  const headers = {
    "x-authentik-username": "native-pre-row-member",
    "x-authentik-uid": castId<ExternalId>("native-pre-row-subject"),
    "x-authentik-groups": "native-test-members",
    "x-authentik-email": "native-member@example.test",
    "x-user-id": root.ownerId,
    "x-role": "owner",
  };
  try {
    const response = await root.http.request("/api/auth/me", { headers });
    expect(response.status).toBe(200);
    expect(authMeSchema.parse(await response.json())).toEqual({ authenticated: true, handle: headers["x-authentik-username"], role: "user" });
    expect(provision.mock.calls).toEqual([
      [
        {
          externalId: headers["x-authentik-uid"],
          handle: headers["x-authentik-username"],
          groups: ["native-test-members"],
          email: headers["x-authentik-email"],
        },
        { ownerClaimProven: true },
      ],
    ]);
    const row = (await readAccounts(root)).find(({ externalId }) => externalId === headers["x-authentik-uid"]);
    expect(row).toMatchObject({ handle: headers["x-authentik-username"], role: "user" });
    expect(row?.id).not.toBe(root.ownerId);
  } finally {
    provision.mockRestore();
  }
});

test("fallback and frozen-host identities read the same live owner row instead of granting the verification placeholder a role", async () => {
  const placeholder = castId<Handle>("verification-placeholder-is-not-owner");
  // A record names a placeholder apart from the owner only beside an explicit owner handle; the owner keeps the default.
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    rolePolicyConfig: { [DEFAULT_USER_HANDLE_KEY]: placeholder, [OWNER_HANDLES_KEY]: createTestEnv().DEFAULT_USER_HANDLE },
    physicalPeer: () => "127.0.0.1",
  });
  const owner = await root.principalFor(root.ownerId);
  const first = await root.http.request("/api/auth/me");
  expect(authMeSchema.parse(await first.json())).toEqual({ authenticated: true, handle: owner.handle, role: "owner" });
  expect(isOwner(owner)).toBe(true);
  expect(typeof owner.role).toBe("object");
  expect(Object.isFrozen(owner.role)).toBe(true);
  expect(Object.keys(owner.role)).toEqual([]);
  expect((await root.services.admin.listUsers({ principal: owner })).filter(({ handle }) => handle === placeholder)).toEqual([]);

  // A damaged stored role must fail closed consistently, not become a second in-memory owner verdict.
  await damageOwnerRow(root, { role: "admin" });
  const host = await root.principalFor(root.ownerId);
  const changed = await root.http.request("/api/auth/me");
  expect(isOwner(host)).toBe(false);
  expect(isAdmin(host)).toBe(true);
  expect(isOwner(owner)).toBe(true);
  expect(authMeSchema.parse(await changed.json())).toEqual({ authenticated: true, handle: host.handle, role: "admin" });

  await damageOwnerRow(root, { enabled: false });
  const disabled = await root.http.request("/api/auth/me");
  expect(authMeSchema.parse(await disabled.json())).toEqual({ authenticated: false, handle: null, role: null });
});
