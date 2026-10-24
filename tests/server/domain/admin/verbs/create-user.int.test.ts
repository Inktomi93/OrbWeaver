// @subject packages/server/src/domain/admin/verbs/create-user.ts
// @subject packages/server/src/transport/trpc/role-output.ts

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect } from "@orb/testkit/node";
import { delegate, NEW_HANDLE, PASSWORD, test } from "./create-user.fixtures.ts";

test("the minted account carries its local-light vector floor", async ({ root }) => {
  const admin = await delegate(root);
  const view = await admin.caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD });
  expect(await root.services.connection.list({ principal: await root.principalFor(view.id) })).toHaveLength(2);
});

test("an empty handle is rejected (invalid_handle)", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>("   "), password: PASSWORD })).rejects.toMatchObject({
    code: "invalid_handle",
  });
});

test("a short password is rejected (weak_password)", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: "short" })).rejects.toMatchObject({
    code: "weak_password",
  });
});

test("even the owner cannot mint a second owner (cannot_grant_owner)", async ({ root }) => {
  await expect(
    root.services.admin.createUser({ principal: await root.principalFor(root.ownerId), handle: NEW_HANDLE, password: PASSWORD, role: "owner" }),
  ).rejects.toMatchObject({ code: "cannot_grant_owner" });
});

test("a delegated admin cannot mint an admin and writes no account", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: PASSWORD, role: "admin" })).rejects.toThrow(
    DomainForbiddenError,
  );
  expect((await root.services.admin.listUsers({ principal: await root.principalFor(root.ownerId) })).filter(({ handle }) => handle === NEW_HANDLE)).toEqual([]);
});

test("a delegated admin cannot mint an owner — authority refuses before owner validation", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: PASSWORD, role: "owner" })).rejects.toThrow(
    DomainForbiddenError,
  );
});

test("a duplicate handle is rejected (user_exists)", async ({ root }) => {
  const admin = await delegate(root);
  await admin.caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD });
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: PASSWORD })).rejects.toMatchObject({
    code: "user_exists",
  });
});

test("a held handle's look-alike is rejected, while a genuinely different handle is minted", async ({ root }) => {
  const admin = await delegate(root);
  await admin.caller.admin.createUser({ handle: castId<Handle>("host"), password: PASSWORD });
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>("h0st"), password: PASSWORD })).rejects.toMatchObject({
    code: "user_exists",
  });
  expect(await admin.caller.admin.createUser({ handle: castId<Handle>("hosts"), password: PASSWORD })).toMatchObject({ handle: "hosts" });
});

test("a mixed-script handle is rejected; a single-script non-Latin handle is minted", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>("hσst"), password: PASSWORD })).rejects.toMatchObject({
    code: "invalid_handle",
  });
  expect(await admin.caller.admin.createUser({ handle: castId<Handle>("Дмитрий"), password: PASSWORD })).toMatchObject({ handle: "Дмитрий" });
});

test("handles containing only zero-width or blank characters are rejected", async ({ root }) => {
  const admin = await delegate(root);
  for (const handle of ["\u200b\u200b", "\u2060", "\u3000"]) {
    await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>(handle), password: PASSWORD })).rejects.toMatchObject({
      code: "invalid_handle",
    });
  }
});

test("a handle that only contains the seed key is minted", async ({ root }) => {
  const admin = await delegate(root);
  expect(await admin.caller.admin.createUser({ handle: castId<Handle>("owners"), password: PASSWORD })).toMatchObject({ handle: "owners" });
});

test("a plain user is denied", async ({ root }) => {
  const user = await root.actor();
  await expect(root.services.admin.createUser({ principal: await root.principalFor(user.id), handle: NEW_HANDLE, password: PASSWORD })).rejects.toThrow(
    DomainForbiddenError,
  );
});
