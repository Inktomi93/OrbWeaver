import { USER_SETTINGS_SCHEMA_VERSION, userSettingsConfig } from "@orb/contracts/settings";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";

test("existing panel preferences default to Context without resetting hidden or collapsed choices", ({ ids }) => {
  const pluginId = mintTypeId(ID_PREFIX.plugin, ids.next);
  const parsed = userSettingsConfig.parseOutcome({ profile: { hiddenChatPluginIds: [pluginId], flankCollapsed: true } }, USER_SETTINGS_SCHEMA_VERSION);
  expect(parsed.intact).toBe(true);
  expect(parsed.value.profile).toMatchObject({ hiddenChatPluginIds: [pluginId], flankCollapsed: true, sidecarChatPluginSurfaces: [] });
});

test("sidecar choices retain both plugin and surface identity and survive a settings round-trip", ({ ids }) => {
  const first = mintTypeId(ID_PREFIX.plugin, ids.next);
  const second = mintTypeId(ID_PREFIX.plugin, ids.next);
  const sidecarChatPluginSurfaces = [
    { pluginId: first, surfaceId: "first" },
    { pluginId: first, surfaceId: "second" },
    { pluginId: second, surfaceId: "first" },
  ];
  const profile = { sidecarChatPluginSurfaces, hiddenChatPluginIds: [second], flankCollapsed: true };
  const parsed = userSettingsConfig.parseOutcome({ profile }, USER_SETTINGS_SCHEMA_VERSION);
  expect(parsed.intact).toBe(true);
  expect(userSettingsConfig.parseOutcome(JSON.parse(JSON.stringify(parsed.value)), USER_SETTINGS_SCHEMA_VERSION).value.profile).toEqual(profile);
});

test("one invalid stored sidecar pointer does not erase the person's other panel choices", ({ ids }) => {
  const pluginId = mintTypeId(ID_PREFIX.plugin, ids.next);
  const valid = { pluginId, surfaceId: "ledger" };
  const parsed = userSettingsConfig.parseOutcome(
    { profile: { sidecarChatPluginSurfaces: [valid, { pluginId, surfaceId: "Invalid surface" }], flankCollapsed: true } },
    USER_SETTINGS_SCHEMA_VERSION,
  );
  expect(parsed.value.profile.sidecarChatPluginSurfaces).toEqual([valid]);
  expect(parsed.value.profile.flankCollapsed).toBe(true);
});
