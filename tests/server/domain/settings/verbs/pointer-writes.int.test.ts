// A settings read heals a malformed id pointer to null; a settings write that carries one is refused, so a bad id
// is never stored as "unset".
// @subject packages/server/src/domain/settings/verbs/update-user-settings-section.ts
// @subject packages/contracts/src/settings/index.ts
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test("a well-formed preset pointer is stored and a malformed one is refused with the stored value kept", async ({ ids }) => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = ids.typeId(ID_PREFIX.preset);

  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset } });
  await expect(caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: "not-a-preset-id" } })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });

  expect((await caller.settings.getUserSettings()).config.seeds.defaultPresetId).toBe(preset);
});

test("a malformed background asset pointer is refused while the empty no-pick value is stored", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);

  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { backgroundAssetId: "" } });
  await expect(caller.settings.updateUserSettingsSection({ section: "appearance", patch: { backgroundAssetId: "asset_bad" } })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });

  expect((await caller.settings.getUserSettings()).config.appearance.backgroundAssetId).toBe("");
});
