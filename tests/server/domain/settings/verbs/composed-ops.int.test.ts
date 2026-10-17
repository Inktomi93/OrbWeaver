// Real settings verbs keep the user's latch plane separate and retain owner governance on certificate writes.
import "@orb/testkit/node/composed-real.ts";
import { DomainForbiddenError } from "@orb/kit/errors";
import { createSettingsComposedOps } from "@orb/server/domain/settings";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

test("onboarding retains the original Principal, another user stays unseeded, and certificate governance remains owner-only", async ({
  harness,
  db,
  services,
}): Promise<void> => {
  const actor = await principal(harness, (await seedUser(db, { role: "admin" })).id);
  const neighbor = await principal(harness, (await seedUser(db)).id);
  const write = vi.spyOn(services.settings, "updateUserSettingsSection");
  const ops = createSettingsComposedOps(services.settings);
  await ops.markExamplePluginSeeded(actor);
  await ops.markDistributedPluginApplied(actor);
  const versions = { showcase: "1.2.3" };
  await ops.writeSeededPluginVersions(actor, versions);
  versions.showcase = "changed-after-write";
  expect(await ops.isExamplePluginSeeded(actor)).toBe(true);
  expect(await ops.isDistributedPluginApplied(actor)).toBe(true);
  expect(await ops.readSeededPluginVersions(actor)).toEqual({ showcase: "1.2.3" });
  expect(await ops.isExamplePluginSeeded(neighbor)).toBe(false);
  expect(await ops.isDistributedPluginApplied(neighbor)).toBe(false);
  expect(write.mock.calls.every(([args]) => args.principal === actor)).toBe(true);
  await expect(ops.saveCertificateSetting(actor, ops.certificateSetting())).rejects.toBeInstanceOf(DomainForbiddenError);
});
