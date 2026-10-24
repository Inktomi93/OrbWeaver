import { authMeSchema } from "@orb/contracts/identity";

import { brandedId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, createTestEnv, readAccounts } from "@orb/testkit/node/composed";
import { headerIdentity, me, rootForConfig, rootForPolicy } from "./role-policy-config.fixtures.ts";

test("a composed role policy ignores subsequent source-config grants", async () => {
  const config = { ...createTestEnv() };
  await using root = await rootForConfig(config);
  const headers = {
    "x-authentik-username": "snapshot-policy-member",
    "x-authentik-uid": brandedId("ExternalId").parse("snapshot-policy-subject"),
    "x-authentik-groups": "late-process-admins",
  };
  const before = await root.http.request("/api/auth/me", { headers });
  expect(before.status).toBe(200);
  const identity = authMeSchema.parse(await before.json());
  expect(identity).toEqual({ authenticated: true, handle: headers["x-authentik-username"], role: "user" });

  config.OIDC_ADMIN_GROUPS = headers["x-authentik-groups"];
  const after = await root.http.request("/api/auth/me", { headers });
  expect(after.status).toBe(200);
  expect(authMeSchema.parse(await after.json())).toEqual(identity);
  expect((await readAccounts(root)).filter(({ externalId }) => externalId === headers["x-authentik-uid"]).map(({ role }) => ({ role }))).toEqual([
    { role: "user" },
  ]);
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
] as const)("a live graph does not reread '$key' from its source config", async ({ key, value }) => {
  const config = { ...createTestEnv() };
  await using root = await rootForConfig(config);
  const headers = headerIdentity("late-owners");
  const identity = await me(root, headers);
  expect(identity).toMatchObject({ authenticated: true, role: "user" });
  config[key] = value;
  expect(await me(root, headers)).toEqual(identity);
  expect((await readAccounts(root)).filter(({ id }) => id === root.ownerId).map(({ handle }) => ({ handle }))).toEqual([{ handle: "owner" }]);
});

test("an identity first seen after a late source-config admin grant is provisioned from the composed policy", async () => {
  const config = { ...createTestEnv() };
  await using root = await rootForConfig(config);
  config.OIDC_ADMIN_GROUPS = "late-process-admins";
  expect(await me(root, headerIdentity("late-process-admins", "late-arrival", "late-arrival-subject"))).toEqual({
    authenticated: true,
    handle: "late-arrival",
    role: "user",
  });
});

test("copied config and exposed owner handles cannot mutate a live graph's authorization", async () => {
  const config = { ...createTestEnv() };
  config.OWNER_HANDLES = "box-owner";
  config.OWNER_GROUP = "original-owners";
  config.OIDC_ADMIN_GROUPS = "original-admins";
  config.OIDC_ALLOWED_GROUPS = undefined;
  await using root = await createServerHarness({
    rolePolicyConfig: config,
    env: { ["AUTH_MODE"]: "forward-header", ["AUTH_FALLBACK"]: "deny", ["FORWARD_AUTH_TRUSTED_PROXIES"]: "127.0.0.1/32" },
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

test("the legacy rederivation flag is a construction-time input, not a live source-config grant", async () => {
  const config = { ...createTestEnv() };
  config.OIDC_ADMIN_GROUPS = undefined;
  config.OIDC_ALLOWED_GROUPS = undefined;
  config.RE_DERIVE_ROLE_ON_LOGIN = undefined;
  await using root = await rootForConfig(config);
  const headers = headerIdentity("");
  await me(root, headers);
  const row = (await readAccounts(root)).find(({ externalId }) => externalId === brandedId("ExternalId").parse("policy-member-subject"));
  if (row === undefined) {
    throw new Error("successful header login produced no account");
  }
  await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: row.id, role: "admin" });
  config.RE_DERIVE_ROLE_ON_LOGIN = "true";
  expect(await me(root, headers)).toMatchObject({ role: "admin" });
  expect((await readAccounts(root)).filter(({ id }) => id === row.id).map(({ role }) => ({ role }))).toEqual([{ role: "admin" }]);
});

test("fixed group governance still rederives stored roles from every login's current claims", async () => {
  await using root = await rootForPolicy({ ["OIDC_ADMIN_GROUPS"]: "admins" });
  expect(await me(root, headerIdentity("admins"))).toMatchObject({ role: "admin" });
  expect(await me(root, headerIdentity("ordinary"))).toMatchObject({ role: "user" });
  const row = (await readAccounts(root)).find(({ externalId }) => externalId === brandedId("ExternalId").parse("policy-member-subject"));
  if (row === undefined) {
    throw new Error("successful header login produced no account");
  }
  await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: row.id, role: "admin" });
  expect(await me(root, headerIdentity(""))).toMatchObject({ role: "user" });
  expect((await readAccounts(root)).filter(({ id }) => id === row.id).map(({ role }) => ({ role }))).toEqual([{ role: "user" }]);
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
  const rows = (await readAccounts(root))
    .filter(({ externalId }) => externalId === brandedId("ExternalId").parse("policy-member-subject"))
    .map(({ role: stored }) => ({ role: stored }));
  expect(rows).toEqual(role === null ? [] : [{ role }]);
  expect((await root.http.request("/api/trpc/sessions.me", { headers })).status).toBe(role === null ? 401 : 200);
});

test("an IdP rename cannot take the graph's reserved seed key or its comparison-key look-alike", async () => {
  await using root = await rootForPolicy({ ["OWNER_HANDLES"]: "box-owner" });
  expect(await me(root, headerIdentity(""))).toMatchObject({ role: "user" });
  await me(root, headerIdentity("", "Box-Owner"));
  expect(
    (await readAccounts(root))
      .filter(({ externalId }) => externalId === brandedId("ExternalId").parse("policy-member-subject"))
      .map(({ handle }) => ({ handle })),
  ).toEqual([{ handle: "policy-member" }]);
  await me(root, headerIdentity("", "ordinary-renamed"));
  expect(
    (await readAccounts(root))
      .filter(({ externalId }) => externalId === brandedId("ExternalId").parse("policy-member-subject"))
      .map(({ handle }) => ({ handle })),
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
  const row = (await readAccounts(root)).find(({ externalId }) => externalId === brandedId("ExternalId").parse("policy-member-subject"));
  if (row === undefined) {
    throw new Error("successful header login produced no account");
  }
  await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: row.id, role: "admin" });
  expect(await me(root, headerIdentity(""))).toMatchObject({ role: rederive ? "user" : "admin" });
  expect((await readAccounts(root)).filter(({ id }) => id === row.id).map(({ role }) => ({ role }))).toEqual([{ role: rederive ? "user" : "admin" }]);
});
