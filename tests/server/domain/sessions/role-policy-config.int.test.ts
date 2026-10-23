import "@orb/testkit/node/composed-real.ts";
import { authMeSchema } from "@orb/contracts/identity";
import { users } from "@orb/db";

import { brandedId } from "@orb/kit/ids";
import type { SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { env } from "@orb/server/foundation/env";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";
import { afterEach, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

function rootForPolicy(policy: Partial<SessionsRolePolicyConfig> = {}): Promise<ServerTestHarness> {
  return createServerHarness({
    rolePolicyConfig: { ...env, ...policy },
    authConfig: { ...authConfigFromEnv(), mode: "forward-header", fallback: "deny", forwardTrustedProxies: ["127.0.0.1/32"] },
    physicalPeer: () => "127.0.0.1",
  });
}

function headerIdentity(groups: string, handle = "policy-member", subject = "policy-member-subject"): Headers {
  return new Headers({ "x-authentik-username": handle, "x-authentik-uid": subject, "x-authentik-groups": groups });
}

async function me(root: Pick<ServerTestHarness, "http">, headers: Headers): Promise<ReturnType<typeof authMeSchema.parse>> {
  const response = await root.http.request("/api/auth/me", { headers });
  expect(response.status).toBe(200);
  return authMeSchema.parse(await response.json());
}

test("a composed role policy ignores subsequent process-environment grants", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "forward-header", fallback: "deny", forwardTrustedProxies: ["127.0.0.1/32"] },
    physicalPeer: () => "127.0.0.1",
  });
  const headers = {
    "x-authentik-username": "snapshot-policy-member",
    "x-authentik-uid": brandedId("ExternalId").parse("snapshot-policy-subject"),
    "x-authentik-groups": "late-process-admins",
  };
  const before = await root.http.request("/api/auth/me", { headers });
  expect(before.status).toBe(200);
  const identity = authMeSchema.parse(await before.json());
  expect(identity).toEqual({ authenticated: true, handle: headers["x-authentik-username"], role: "user" });

  vi.stubEnv("OIDC_ADMIN_GROUPS", headers["x-authentik-groups"]);
  const after = await root.http.request("/api/auth/me", { headers });
  expect(after.status).toBe(200);
  expect(authMeSchema.parse(await after.json())).toEqual(identity);
  expect(await root.db.select({ role: users.role }).from(users).where(eq(users.externalId, headers["x-authentik-uid"]))).toEqual([{ role: "user" }]);
});

test("distinct composed policy snapshots do not share grants or depend on another root's lifetime", async () => {
  await using first = await rootForPolicy({ ["OIDC_ADMIN_GROUPS"]: "first-admins" });
  await using second = await rootForPolicy({ ["OIDC_ADMIN_GROUPS"]: "second-admins" });
  expect(await me(first, headerIdentity("first-admins"))).toMatchObject({ authenticated: true, role: "admin" });
  expect(await me(second, headerIdentity("first-admins"))).toMatchObject({ authenticated: true, role: "user" });
  await first[Symbol.asyncDispose]();
  expect(await me(second, headerIdentity("second-admins"))).toMatchObject({ authenticated: true, role: "admin" });
});

test.each([
  { key: "OWNER_HANDLES", value: "policy-member" },
  { key: "OWNER_GROUP", value: "late-owners" },
  { key: "OIDC_ALLOWED_GROUPS", value: "newly-required" },
])("a live graph does not reread '$key' from process state", async ({ key, value }) => {
  await using root = await rootForPolicy();
  const headers = headerIdentity("late-owners");
  const identity = await me(root, headers);
  expect(identity).toMatchObject({ authenticated: true, role: "user" });
  vi.stubEnv(key, value);
  expect(await me(root, headers)).toEqual(identity);
  expect(await root.db.select({ handle: users.handle }).from(users).where(eq(users.id, root.ownerId))).toEqual([{ handle: "owner" }]);
});

test("an identity first seen after a late process-environment admin grant is provisioned from the composed policy", async () => {
  await using root = await rootForPolicy();
  vi.stubEnv("OIDC_ADMIN_GROUPS", "late-process-admins");
  expect(await me(root, headerIdentity("late-process-admins", "late-arrival", "late-arrival-subject"))).toEqual({
    authenticated: true,
    handle: "late-arrival",
    role: "user",
  });
});

test("copied config and exposed owner handles cannot mutate a live graph's authorization", async () => {
  const config = { ...env };
  config.OWNER_HANDLES = "box-owner";
  config.OWNER_GROUP = "original-owners";
  config.OIDC_ADMIN_GROUPS = "original-admins";
  config.OIDC_ALLOWED_GROUPS = undefined;
  await using root = await createServerHarness({
    rolePolicyConfig: config,
    authConfig: { ...authConfigFromEnv(), mode: "forward-header", fallback: "deny", forwardTrustedProxies: ["127.0.0.1/32"] },
    physicalPeer: () => "127.0.0.1",
  });
  config.OWNER_HANDLES = "policy-member";
  config.OWNER_GROUP = "late-grants";
  config.OIDC_ADMIN_GROUPS = "late-grants";
  config.OIDC_ALLOWED_GROUPS = "newly-required";
  config.DEFAULT_USER_HANDLE = "changed-placeholder";
  config.RE_DERIVE_ROLE_ON_LOGIN = "true";
  const handles = root.app.sessions.rolePolicy.ownerHandles();
  expect(Reflect.set(handles, "0", "policy-member")).toBe(false);
  expect(await me(root, headerIdentity("late-grants"))).toEqual({ authenticated: true, handle: "policy-member", role: "user" });
  const owner = await root.principalFor(root.ownerId);
  expect(owner.handle).toBe("box-owner");
  await expect(
    root.services.admin.createUser({ principal: owner, handle: brandedId("Handle").parse("Box-Owner"), password: "synthetic-policy-password" }),
  ).rejects.toMatchObject({ code: "invalid_handle" });
});

test("the legacy rederivation flag is a construction-time input, not a live process grant", async () => {
  await using root = await rootForPolicy({ ["OIDC_ADMIN_GROUPS"]: undefined, ["OIDC_ALLOWED_GROUPS"]: undefined, ["RE_DERIVE_ROLE_ON_LOGIN"]: undefined });
  const headers = headerIdentity("");
  await me(root, headers);
  const row = await root.db
    .select()
    .from(users)
    .where(eq(users.externalId, brandedId("ExternalId").parse("policy-member-subject")))
    .get();
  if (row === undefined) {
    throw new Error("successful header login produced no account");
  }
  await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: row.id, role: "admin" });
  vi.stubEnv("RE_DERIVE_ROLE_ON_LOGIN", "true");
  expect(await me(root, headers)).toMatchObject({ role: "admin" });
  expect(await root.db.select({ role: users.role }).from(users).where(eq(users.id, row.id))).toEqual([{ role: "admin" }]);
});

test("fixed group governance still rederives stored roles from every login's current claims", async () => {
  await using root = await rootForPolicy({ ["OIDC_ADMIN_GROUPS"]: "admins" });
  expect(await me(root, headerIdentity("admins"))).toMatchObject({ role: "admin" });
  expect(await me(root, headerIdentity("ordinary"))).toMatchObject({ role: "user" });
  const row = await root.db
    .select()
    .from(users)
    .where(eq(users.externalId, brandedId("ExternalId").parse("policy-member-subject")))
    .get();
  if (row === undefined) {
    throw new Error("successful header login produced no account");
  }
  await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: row.id, role: "admin" });
  expect(await me(root, headerIdentity(""))).toMatchObject({ role: "user" });
  expect(await root.db.select({ role: users.role }).from(users).where(eq(users.id, row.id))).toEqual([{ role: "user" }]);
});

test.each([
  { groups: "friends", role: "user" },
  { groups: "admins", role: "admin" },
  { groups: "outsiders", role: null },
  { groups: "", role: null },
])("the configured login gate observes '$groups' without creating refused identities", async ({ groups, role }) => {
  await using root = await rootForPolicy({ ["OIDC_ALLOWED_GROUPS"]: "friends", ["OIDC_ADMIN_GROUPS"]: "admins" });
  const headers = headerIdentity(groups);
  expect(await me(root, headers)).toEqual({ authenticated: role !== null, handle: role === null ? null : "policy-member", role });
  const rows = await root.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.externalId, brandedId("ExternalId").parse("policy-member-subject")));
  expect(rows).toEqual(role === null ? [] : [{ role }]);
  expect((await root.http.request("/api/trpc/sessions.me", { headers })).status).toBe(role === null ? 401 : 200);
});

test("an existing owner is immutable and a second group owner becomes user, never admin", async () => {
  await using root = await rootForPolicy({ ["OWNER_GROUP"]: "owners", ["OIDC_ADMIN_GROUPS"]: "admins", ["OIDC_ALLOWED_GROUPS"]: "friends" });
  const owner = await root.principalFor(root.ownerId);
  expect(await me(root, headerIdentity("owners,admins", owner.handle, "first-owner-subject"))).toMatchObject({ role: "owner" });
  expect(await me(root, headerIdentity("", owner.handle, "first-owner-subject"))).toMatchObject({ role: "owner" });
  expect(await me(root, headerIdentity("owners,admins", "second-owner", "second-owner-subject"))).toMatchObject({ role: "user" });
  expect(await root.db.select({ id: users.id }).from(users).where(eq(users.role, "owner"))).toEqual([{ id: root.ownerId }]);
  const before = await root.db.select().from(users).where(eq(users.id, root.ownerId));
  expect(await me(root, headerIdentity("owners", owner.handle, "impostor-subject"))).toEqual({ authenticated: false, handle: null, role: null });
  expect(await root.db.select().from(users).where(eq(users.id, root.ownerId))).toEqual(before);
});

test("an IdP rename cannot take the graph's reserved seed key or its comparison-key look-alike", async () => {
  await using root = await rootForPolicy({ ["OWNER_HANDLES"]: "box-owner" });
  expect(await me(root, headerIdentity(""))).toMatchObject({ role: "user" });
  await me(root, headerIdentity("", "Box-Owner"));
  expect(
    await root.db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.externalId, brandedId("ExternalId").parse("policy-member-subject"))),
  ).toEqual([{ handle: "policy-member" }]);
  await me(root, headerIdentity("", "ordinary-renamed"));
  expect(
    await root.db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.externalId, brandedId("ExternalId").parse("policy-member-subject"))),
  ).toEqual([{ handle: "ordinary-renamed" }]);
});

test.each([
  { flag: "true", rederive: true },
  { flag: "TRUE", rederive: true },
  { flag: "True", rederive: true },
  { flag: "1", rederive: true },
  { flag: "yes", rederive: true },
  { flag: " yes ", rederive: true },
  { flag: "false", rederive: false },
  { flag: "no", rederive: false },
  { flag: "0", rederive: false },
  { flag: "", rederive: false },
  { flag: "nope", rederive: false },
  { flag: undefined, rederive: false },
])("legacy flag '$flag' retains its accepted rederivation semantics", async ({ flag, rederive }) => {
  await using root = await rootForPolicy({ ["OIDC_ADMIN_GROUPS"]: undefined, ["OIDC_ALLOWED_GROUPS"]: undefined, ["RE_DERIVE_ROLE_ON_LOGIN"]: flag });
  await me(root, headerIdentity(""));
  const row = await root.db
    .select()
    .from(users)
    .where(eq(users.externalId, brandedId("ExternalId").parse("policy-member-subject")))
    .get();
  if (row === undefined) {
    throw new Error("successful header login produced no account");
  }
  await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: row.id, role: "admin" });
  expect(await me(root, headerIdentity(""))).toMatchObject({ role: rederive ? "user" : "admin" });
  expect(await root.db.select({ role: users.role }).from(users).where(eq(users.id, row.id))).toEqual([{ role: rederive ? "user" : "admin" }]);
});
