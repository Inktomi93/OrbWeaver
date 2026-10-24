// @subject packages/server/src/entry/compose/services.ts

import { settings } from "@orb/db";
import { createEnableShareSeating } from "@orb/server/domain/share";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import { vi } from "vitest";

test("share seating writes as the canonical owner and restores stored false versus a deployment-default override", async ({
  app,
  harness,
  services,
  ownerCaller,
}) => {
  await ownerCaller.settings.getAppSettings();
  const resolvePrincipal = harness.principalFor;
  const owner = await resolvePrincipal(harness.ownerId);
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

test("restoration leaves already-on settings alone and an actual stored-write failure is not swallowed", async ({
  app,
  db,
  harness,
  services,
  ownerCaller,
}) => {
  await ownerCaller.settings.getAppSettings();
  const resolvePrincipal = harness.principalFor;
  const owner = await resolvePrincipal(harness.ownerId);
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
  await using refusal = await refuseWrites(db, { table: settings, event: "UPDATE", message: "restore refused" });
  try {
    await expect(restore()).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringContaining("restore refused") }) });
  } finally {
    await refusal.lift();
  }
});
