// @subject tests/support/node/server.ts
// A root built with `refuseUnsettledWrites` refuses a mutation that starts while its detached work is still running,
// lets reads through, and accepts the same mutation once the work has settled.
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const NO_BACKGROUND = { section: "appearance", patch: { backgroundAssetId: "" } } as const;

test("a write beside running detached work is refused by name, and accepted after the work settles", async () => {
  await using root = await createServerHarness({ refuseUnsettledWrites: true });
  const caller = await root.internalCallerFor(root.ownerId);
  const held = Promise.withResolvers<undefined>();
  root.app.supervise("unsettled-write-control", "harness.control", {}, async () => await held.promise);

  await expect(caller.settings.updateUserSettingsSection(NO_BACKGROUND)).rejects.toThrow(
    /settings\.updateUserSettingsSection started while detached work from this root was still running/u,
  );
  expect((await caller.settings.getUserSettings()).config.appearance.backgroundAssetId).toBe("");

  held.resolve(undefined);
  await root.settleBackground();
  await caller.settings.updateUserSettingsSection(NO_BACKGROUND);
});

test("a root without the option runs a write beside detached work", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const held = Promise.withResolvers<undefined>();
  root.app.supervise("unsettled-write-control", "harness.control", {}, async () => await held.promise);

  await caller.settings.updateUserSettingsSection(NO_BACKGROUND);
  expect((await caller.settings.getUserSettings()).config.appearance.backgroundAssetId).toBe("");
  held.resolve(undefined);
  await root.settleBackground();
});
