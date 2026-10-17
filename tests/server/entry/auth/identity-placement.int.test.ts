// D1/D40/D135: verification supplies pre-row identity; the real HTTP seam resolves the stored role.
// @subject packages/server/src/entry/auth/seam.ts
// @subject packages/server/src/infra/auth/modes/forward-header.ts
import "@orb/testkit/node/composed-real.ts";
import { authMeSchema } from "@orb/contracts/identity";
import { users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isAdmin, isOwner } from "@orb/server/domain/admin";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";
import { vi } from "vitest";

test("the real header seam hands sessions a pre-row identity and never trusts forged userId or role headers", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "forward-header", fallback: "deny", forwardTrustedProxies: ["127.0.0.1/32"] },
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
    const row = await root.db.select().from(users).where(eq(users.externalId, headers["x-authentik-uid"])).get();
    expect(row).toMatchObject({ handle: headers["x-authentik-username"], role: "user" });
    expect(row?.id).not.toBe(root.ownerId);
  } finally {
    provision.mockRestore();
  }
});

test("fallback and frozen-host identities read the same live owner row instead of granting the verification placeholder a role", async () => {
  const placeholder = castId<Handle>("verification-placeholder-is-not-owner");
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner", defaultHandle: placeholder },
    physicalPeer: () => "127.0.0.1",
  });
  const owner = await root.principalFor(root.ownerId);
  const first = await root.http.request("/api/auth/me");
  expect(authMeSchema.parse(await first.json())).toEqual({ authenticated: true, handle: owner.handle, role: "owner" });
  expect(isOwner(owner)).toBe(true);
  expect(typeof owner.role).toBe("object");
  expect(Object.isFrozen(owner.role)).toBe(true);
  expect(Object.keys(owner.role)).toEqual([]);
  expect(await root.db.select({ id: users.id }).from(users).where(eq(users.handle, placeholder))).toEqual([]);

  // A damaged stored role must fail closed consistently, not become a second in-memory owner verdict.
  await root.db.update(users).set({ role: "admin" }).where(eq(users.id, root.ownerId));
  const host = await root.principalFor(root.ownerId);
  const changed = await root.http.request("/api/auth/me");
  expect(isOwner(host)).toBe(false);
  expect(isAdmin(host)).toBe(true);
  expect(isOwner(owner)).toBe(true);
  expect(authMeSchema.parse(await changed.json())).toEqual({ authenticated: true, handle: host.handle, role: "admin" });

  await root.db.update(users).set({ enabled: false }).where(eq(users.id, root.ownerId));
  const disabled = await root.http.request("/api/auth/me");
  expect(authMeSchema.parse(await disabled.json())).toEqual({ authenticated: false, handle: null, role: null });
});
