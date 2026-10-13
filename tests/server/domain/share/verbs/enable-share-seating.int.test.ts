// @subject packages/server/src/entry/compose/services.ts
import "@orb/testkit/node/composed-real.ts";
import { createEnableShareSeating } from "@orb/server/domain/share";
import { createHostPrincipalResolver } from "@orb/server/entry/auth";
import { expect, OWNER_USER_ID, test } from "@orb/testkit/node/fixtures.ts";
import { sql } from "drizzle-orm";
import { vi } from "vitest";

test("share seating writes as the canonical owner and restores stored false versus a deployment-default override", async ({ app, services, ownerCaller }) => {
  await ownerCaller.settings.getAppSettings();
  const resolvePrincipal = createHostPrincipalResolver(app.sessions);
  const owner = await resolvePrincipal(OWNER_USER_ID);
  await services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: null, discreetLogin: false } });
  const before = await services.settings.getAppSettingsWithOverrides({ principal: owner });
  const write = vi.spyOn(services.settings, "updateAppSettings");
  const enable = createEnableShareSeating({
    seating: () => services.settings.getEffectiveConfig(),
    getAppSettingsWithOverrides: (params) => services.settings.getAppSettingsWithOverrides(params),
    updateAppSettings: async (params) => {
      await services.settings.updateAppSettings(params);
    },
    getOwnerUserId: () => app.sessions.getOwnerUserId(),
    resolvePrincipal,
  });
  const restore = await enable();
  expect(write.mock.calls[0]?.[0]).toEqual({ principal: owner, partial: { localMultiUser: true, discreetLogin: true } });
  expect(services.settings.getEffectiveConfig()).toMatchObject({ localMultiUser: true, discreetLogin: true });
  await restore();
  expect(write.mock.calls[1]?.[0]).toEqual({ principal: owner, partial: { localMultiUser: null, discreetLogin: false } });
  expect((await services.settings.getAppSettingsWithOverrides({ principal: owner })).overrides).toEqual(before.overrides);
});

test("restoration leaves already-on settings alone and an actual stored-write failure is not swallowed", async ({ app, db, services, ownerCaller }) => {
  await ownerCaller.settings.getAppSettings();
  const resolvePrincipal = createHostPrincipalResolver(app.sessions);
  const owner = await resolvePrincipal(OWNER_USER_ID);
  await services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: true, discreetLogin: false } });
  const enable = createEnableShareSeating({
    seating: () => services.settings.getEffectiveConfig(),
    getAppSettingsWithOverrides: (params) => services.settings.getAppSettingsWithOverrides(params),
    updateAppSettings: async (params) => {
      await services.settings.updateAppSettings(params);
    },
    getOwnerUserId: () => app.sessions.getOwnerUserId(),
    resolvePrincipal,
  });
  const restore = await enable();
  await services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: false } });
  await restore();
  expect(services.settings.getEffectiveConfig()).toMatchObject({ localMultiUser: false, discreetLogin: false });
  await db.run(sql`CREATE TRIGGER refuse_seating_restore BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT, 'restore refused'); END`);
  try {
    await expect(restore()).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringContaining("restore refused") }) });
  } finally {
    await db.run(sql`DROP TRIGGER refuse_seating_restore`);
  }
});
