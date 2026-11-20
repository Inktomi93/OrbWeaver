import { CSRF_HEADER, OIDC_ADMIN_GROUPS_KEY, OIDC_ALLOWED_GROUPS_KEY, OWNER_HANDLES_KEY, RE_DERIVE_ROLE_ON_LOGIN_KEY } from "@orb/contracts/identity";
import { brandedId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { readAccounts } from "@orb/testkit/node/composed";
import { ADMIN_OP_CODES } from "#server/domain/admin/contract/errors.ts";
import { headerIdentity, me, rootForPolicy } from "./role-policy-config.fixtures.ts";

test("distinct composed policy snapshots do not share grants or depend on another root's lifetime", async () => {
  await using first = await rootForPolicy({ [OIDC_ADMIN_GROUPS_KEY]: "first-admins" });
  await using second = await rootForPolicy({ [OIDC_ADMIN_GROUPS_KEY]: "second-admins" });
  expect(await me(first, headerIdentity("first-admins"))).toMatchObject({ authenticated: true, role: "admin" });
  expect(await me(second, headerIdentity("first-admins"))).toMatchObject({ authenticated: true, role: "user" });
  await first[Symbol.asyncDispose]();
  expect(await me(second, headerIdentity("second-admins"))).toMatchObject({ authenticated: true, role: "admin" });
});

test("an admin mint refuses the configured owner handle's look-alike and admits a different handle", async () => {
  await using root = await rootForPolicy({ [OWNER_HANDLES_KEY]: "box-owner" });
  const owner = await root.principalFor(root.ownerId);
  expect(owner.handle).toBe("box-owner");
  const mint = (raw: string): ReturnType<typeof root.services.admin.createUser> =>
    root.services.admin.createUser({ principal: owner, handle: brandedId("Handle").parse(raw), password: "synthetic-policy-password" });
  await expect(mint("Box-Owner")).rejects.toMatchObject({ code: ADMIN_OP_CODES.invalidHandle });
  expect(await mint("box-owners")).toMatchObject({ handle: "box-owners" });
});

test("fixed group governance still rederives stored roles from every login's current claims", async () => {
  await using root = await rootForPolicy({ [OIDC_ADMIN_GROUPS_KEY]: "admins" });
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
  await using root = await rootForPolicy({ [OIDC_ALLOWED_GROUPS_KEY]: "friends", [OIDC_ADMIN_GROUPS_KEY]: "admins" });
  const headers = headerIdentity(groups);
  expect(await me(root, headers)).toEqual({ authenticated: role !== null, handle: role === null ? null : "policy-member", role });
  const rows = (await readAccounts(root))
    .filter(({ externalId }) => externalId === brandedId("ExternalId").parse("policy-member-subject"))
    .map(({ role: stored }) => ({ role: stored }));
  expect(rows).toEqual(role === null ? [] : [{ role }]);
  expect((await root.http.request("/api/trpc/sessions.me", { headers: new Headers([...headers, [CSRF_HEADER, "1"]]) })).status).toBe(role === null ? 401 : 200);
});

test("an IdP rename cannot take the graph's reserved seed key or its comparison-key look-alike", async () => {
  await using root = await rootForPolicy({ [OWNER_HANDLES_KEY]: "box-owner" });
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
  await using root = await rootForPolicy({ [OIDC_ADMIN_GROUPS_KEY]: undefined, [OIDC_ALLOWED_GROUPS_KEY]: undefined, [RE_DERIVE_ROLE_ON_LOGIN_KEY]: flag });
  await me(root, headerIdentity(""));
  const row = (await readAccounts(root)).find(({ externalId }) => externalId === brandedId("ExternalId").parse("policy-member-subject"));
  if (row === undefined) {
    throw new Error("successful header login produced no account");
  }
  await root.services.admin.setRole({ principal: await root.principalFor(root.ownerId), userId: row.id, role: "admin" });
  expect(await me(root, headerIdentity(""))).toMatchObject({ role: rederive ? "user" : "admin" });
  expect((await readAccounts(root)).filter(({ id }) => id === row.id).map(({ role }) => ({ role }))).toEqual([{ role: rederive ? "user" : "admin" }]);
});
