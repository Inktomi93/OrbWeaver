// Invariant 10's bind-once subject claim and D257's rename key, driven through the composed server's real doors.
// @subject packages/server/src/domain/sessions/persistence/users.ts
// @subject packages/server/src/domain/sessions/verbs/link-external-id.ts
// @subject packages/server/src/domain/sessions/verbs/provision-identity.ts
import {
  AUTH_FALLBACK_KEY,
  AUTH_MODE_KEY,
  authMeSchema,
  FORWARD_AUTH_TRUSTED_PROXIES_KEY,
  OIDC_ALLOWED_GROUPS_KEY,
  OWNER_GROUP_KEY,
} from "@orb/contracts/identity";
import { users } from "@orb/db";
import { errorMessage } from "@orb/kit/error-message";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, createTestEnv } from "@orb/testkit/node/composed";
import type { SQL } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { ADMIN_OP_CODES } from "#server/domain/admin/contract/errors.ts";

const OWNER_GROUP = "identity-owners";
const MEMBER_GROUP = "identity-members";
const subject = (value: string): ExternalId => brandedId("ExternalId").parse(value);
const handle = (value: string): Handle => brandedId("Handle").parse(value);

function forwardHeaderRoot(policy: Partial<SessionsRolePolicyConfig> = {}): Promise<ServerTestHarness> {
  // Only this suite's group policy decides who may sign in here, never a record default.
  const { OIDC_ADMIN_GROUPS: _admins, OIDC_ALLOWED_GROUPS: _allowed, OWNER_GROUP: _owners, ...base } = createTestEnv();
  return createServerHarness({
    rolePolicyConfig: { ...base, [OIDC_ALLOWED_GROUPS_KEY]: MEMBER_GROUP, ...policy },
    env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny", [FORWARD_AUTH_TRUSTED_PROXIES_KEY]: "127.0.0.1/32" },
    physicalPeer: () => "127.0.0.1",
  });
}

async function login(
  root: ServerTestHarness,
  as: { readonly handle: Handle; readonly subject: ExternalId; readonly groups?: string },
): Promise<ReturnType<typeof authMeSchema.parse>> {
  const response = await root.http.request("/api/auth/me", {
    headers: { "x-authentik-username": as.handle, "x-authentik-uid": as.subject, "x-authentik-groups": as.groups ?? MEMBER_GROUP },
  });
  expect(response.status).toBe(200);
  return authMeSchema.parse(await response.json());
}

async function storedSubject(root: ServerTestHarness, where: SQL): Promise<(ExternalId | null)[]> {
  const rows = await root.db.select({ externalId: users.externalId }).from(users).where(where);
  return rows.map(({ externalId }) => externalId);
}

test("an SSO login whose handle resolves to a row bound to another subject never rebinds it", async () => {
  await using root = await forwardHeaderRoot();
  const first = subject("identity-alice-first");
  expect(await login(root, { handle: handle("identity-alice"), subject: first })).toMatchObject({ authenticated: true, handle: "identity-alice" });
  const impostor = subject("identity-alice-impostor");
  expect(await login(root, { handle: handle("identity-alice"), subject: impostor })).not.toMatchObject({ authenticated: true, handle: "identity-alice" });
  expect(await storedSubject(root, eq(users.handle, handle("identity-alice")))).toEqual([first]);
  expect(await root.db.select({ id: users.id }).from(users).where(eq(users.externalId, impostor))).toEqual([]);
});

test("the admin link claim binds an unbound row once and refuses a rebind or a held subject", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const member = await root.actor();
  const other = await root.actor();
  const bound = subject("identity-link-first");
  await root.services.admin.linkSsoIdentity({ principal: owner, userId: member.id, externalId: bound });
  await expect(root.services.admin.linkSsoIdentity({ principal: owner, userId: member.id, externalId: subject("identity-link-second") })).rejects.toMatchObject(
    {
      code: ADMIN_OP_CODES.ssoRowBound,
    },
  );
  await expect(root.services.admin.linkSsoIdentity({ principal: owner, userId: other.id, externalId: bound })).rejects.toMatchObject({
    code: ADMIN_OP_CODES.ssoSubjectTaken,
  });
  expect(await storedSubject(root, eq(users.id, member.id))).toEqual([bound]);
  expect(await storedSubject(root, eq(users.id, other.id))).toEqual([null]);
});

test("an unexplained link rejection keeps its Error, and a non-Error value stays out of the message", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const member = await root.actor();
  const link = (): Promise<unknown> => root.services.admin.linkSsoIdentity({ principal: owner, userId: member.id, externalId: subject("identity-link-fault") });
  using batch = vi.spyOn(root.db, "batch");

  const fault = new Error("controlled batch fault");
  batch.mockRejectedValueOnce(fault);
  await expect(link()).rejects.toBe(fault);

  const unreviewed = "controlled non-Error rejection";
  batch.mockRejectedValueOnce(unreviewed);
  const refused: unknown = await link().catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(Error);
  expect(refused).toMatchObject({ cause: unreviewed });
  expect(errorMessage(refused)).not.toContain(unreviewed);
  expect(await storedSubject(root, eq(users.id, member.id))).toEqual([null]);
});

test("two concurrent admin links with different subjects bind exactly one", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const member = await root.actor();
  const subjects = [subject("identity-race-a"), subject("identity-race-b")];
  const settled = await Promise.allSettled(
    subjects.map((externalId) => root.services.admin.linkSsoIdentity({ principal: owner, userId: member.id, externalId })),
  );
  const winners = subjects.filter((_, index) => settled[index]?.status === "fulfilled");
  expect(winners).toHaveLength(1);
  expect(settled.find(({ status }) => status === "rejected")).toMatchObject({ reason: { code: ADMIN_OP_CODES.ssoRowBound } });
  expect(await storedSubject(root, eq(users.id, member.id))).toEqual(winners);
});

test("concurrent owner-policy logins with different subjects adopt the unbound owner row once", async () => {
  await using root = await forwardHeaderRoot({ [OWNER_GROUP_KEY]: OWNER_GROUP });
  expect(await storedSubject(root, eq(users.id, root.ownerId))).toEqual([null]);
  const callers = [
    { handle: handle("identity-owner-a"), subject: subject("identity-owner-a"), groups: OWNER_GROUP },
    { handle: handle("identity-owner-b"), subject: subject("identity-owner-b"), groups: OWNER_GROUP },
  ];
  const identities = await Promise.all(callers.map((caller) => login(root, caller)));
  const owners = callers.filter((_, index) => identities[index]?.authenticated === true && identities[index].role === "owner");
  expect(owners).toHaveLength(1);
  expect(await storedSubject(root, eq(users.id, root.ownerId))).toEqual(owners.map(({ subject: bound }) => bound));
  expect(await root.db.select({ id: users.id }).from(users).where(eq(users.role, "owner"))).toEqual([{ id: root.ownerId }]);
});

test("an IdP rename stores the new handle's key, so a look-alike of the new handle cannot take it", async () => {
  await using root = await forwardHeaderRoot();
  const renamed = subject("identity-rename");
  expect(await login(root, { handle: handle("identity-bob"), subject: renamed })).toMatchObject({ authenticated: true, handle: "identity-bob" });
  expect(await login(root, { handle: handle("Identity-Robert"), subject: renamed })).toMatchObject({ authenticated: true, handle: "Identity-Robert" });
  expect(await root.db.select({ handle: users.handle, handleKey: users.handleKey }).from(users).where(eq(users.externalId, renamed))).toEqual([
    { handle: "Identity-Robert", handleKey: handleKey(handle("Identity-Robert")) },
  ]);
  const lookalike = subject("identity-robert-lookalike");
  expect(await login(root, { handle: handle("IDENTITY-ROBERT"), subject: lookalike })).not.toMatchObject({ authenticated: true, handle: "IDENTITY-ROBERT" });
  expect(
    await root.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handleKey, handleKey(handle("IDENTITY-ROBERT")))),
  ).toHaveLength(1);
});
