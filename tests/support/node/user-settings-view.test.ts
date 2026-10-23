// @subject tests/support/iso/user-settings-view.ts

import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION, userSettingsViewSchema } from "@orb/contracts/settings";

import { createIdSource } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";

describe("production-derived settings builders", () => {
  test("a section patch preserves its siblings and other sections", async () => {
    const { userSettingsConfig } = await import("@orb/testkit/iso/user-settings-view.ts");
    const config = userSettingsConfig({ chat: { offerChoices: !DEFAULT_USER_SETTINGS.chat.offerChoices } });
    expect(config.chat).toEqual({ ...DEFAULT_USER_SETTINGS.chat, offerChoices: !DEFAULT_USER_SETTINGS.chat.offerChoices });
    expect(config.appearance).toEqual(DEFAULT_USER_SETTINGS.appearance);
    expect(config.seeds).toEqual(DEFAULT_USER_SETTINGS.seeds);
  });

  test("the read envelope preserves supplied identity and uses the owner's current version", async () => {
    const { userSettingsView } = await import("@orb/testkit/iso/user-settings-view.ts");
    const userId = createIdSource(createSeededIds().next).userId();
    const view = userSettingsView({}, { userId });
    expect(view.userId).toBe(userId);
    expect(view.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);
    expect(view.updatedAt).toBe(0);
    expect(view.configUnreadable).toBeNull();
    expect(userSettingsViewSchema.parse(view)).toEqual(view);
  });

  test("an override cannot produce an envelope the real output parser refuses", async () => {
    const { userSettingsView } = await import("@orb/testkit/iso/user-settings-view.ts");
    expect(() => userSettingsView({}, { schemaVersion: Number.NaN })).toThrow();
    expect(() => userSettingsView({}, { updatedAt: Number.POSITIVE_INFINITY })).toThrow();
  });
});
