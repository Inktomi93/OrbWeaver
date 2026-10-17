// Boot delegates trusted identity operations without borrowing an owner Principal for bootstrap.
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { Handle } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { createListSeedAccountIds } from "@orb/server/domain/sessions";
import { seedOwner, settleBootSecrets } from "@orb/server/entry/boot";
import { SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

test("trusted boot moves its singleton seed key without taking another account's key and still enumerates disabled accounts", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const heldHandle = brandedId<Handle>().parse("boot-held-handle");
  const otherId = await root.app.sessions.ensureUser(heldHandle);
  const deps = { db: root.db, sessions: root.app.sessions, now: root.clock.now };
  expect(await seedOwner({ ...deps, ownerHandles: ["boot-moved-owner"] })).toEqual([owner.userId]);
  expect(await root.app.sessions.loadUserById(owner.userId)).toMatchObject({ handle: "boot-moved-owner", enabled: true });
  expect(await (await root.internalCallerFor(owner.userId)).sessions.me()).toMatchObject({ handle: "boot-moved-owner", globalRole: "owner" });
  await expect(seedOwner({ ...deps, ownerHandles: [heldHandle] })).rejects.toThrow("already held by another user");
  expect(await root.app.sessions.loadUserById(otherId)).toMatchObject({ handle: heldHandle });
  expect(await (await root.internalCallerFor(otherId)).sessions.me()).toMatchObject({ handle: heldHandle, globalRole: "user" });
  expect(await root.app.sessions.loadUserById(owner.userId)).toMatchObject({ handle: "boot-moved-owner" });
  expect(await (await root.internalCallerFor(owner.userId)).sessions.me()).toMatchObject({ handle: "boot-moved-owner", globalRole: "owner" });
  await root.services.admin.setEnabled({ principal: await root.principalFor(owner.userId), userId: otherId, enabled: false });
  expect((await createListSeedAccountIds(databaseHandle(root.db))()).toSorted()).toEqual([owner.userId, otherId].toSorted());
  expect(await seedOwner({ ...deps, ownerHandles: [owner.handle] })).toEqual([owner.userId]);
});

test("another account's actual password blocks a missing pepper after credential-key settlement and before session-key creation", async () => {
  await using resources = new AsyncDisposableStack();
  const directory = await mkdtemp(join(tmpdir(), "identity-enforcement-972-secrets-"));
  resources.defer(() => rm(directory, { recursive: true, force: true }));
  const root = resources.use(await createServerHarness());
  const owner = await root.principalFor(root.ownerId);
  const created = await root.services.admin.createUser({
    principal: owner,
    handle: brandedId<Handle>().parse("boot-password-dependent"),
    password: "synthetic-boot-dependent-password",
  });
  expect(created.id).not.toBe(owner.userId);
  expect(await root.app.sessions.ownerNeedsPassword()).toBe(true);
  const credentialPath = join(directory, SECRET_FILE_NAMES.credentialsKey);
  const sessionPath = join(directory, SECRET_FILE_NAMES.sessionSecret);
  await expect(
    settleBootSecrets({
      db: root.db,
      now: root.clock.now,
      credentialsKey: { kind: "absent", path: credentialPath },
      sessionSecret: { kind: "absent", path: sessionPath },
    }),
  ).rejects.toThrow(`SESSION_SECRET is unset and the keyfile ${sessionPath} does not exist`);
  expect((await stat(credentialPath)).isFile()).toBe(true);
  await expect(access(sessionPath)).rejects.toMatchObject({ code: "ENOENT" });
});
