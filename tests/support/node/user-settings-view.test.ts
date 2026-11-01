// @subject tests/support/iso/user-settings-view.ts

import { DEFAULT_USER_SETTINGS, userSettingsViewSchema } from "@orb/contracts/settings";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";

import { describe } from "vitest";
import { ZodError } from "zod";
import { expect, test } from "./fixtures.ts";

describe("production-derived settings builders", () => {
  test("a section patch preserves its siblings and other sections", async () => {
    const { userSettingsConfig } = await import("../iso/user-settings-view.ts");
    const config = userSettingsConfig({ chat: { offerChoices: !DEFAULT_USER_SETTINGS.chat.offerChoices } });
    expect(config.chat).toEqual({ ...DEFAULT_USER_SETTINGS.chat, offerChoices: !DEFAULT_USER_SETTINGS.chat.offerChoices });
    expect(config.appearance).toEqual(DEFAULT_USER_SETTINGS.appearance);
    expect(config.seeds).toEqual(DEFAULT_USER_SETTINGS.seeds);
  });

  test("the read envelope reports an intact config unless told otherwise", async () => {
    const { userSettingsView } = await import("../iso/user-settings-view.ts");
    const view = userSettingsView({}, {});
    expect(view.configUnreadable).toBeNull();
    expect(userSettingsViewSchema.parse(view)).toEqual(view);
  });

  test("an override cannot produce an envelope the real output parser refuses", async () => {
    const { userSettingsView } = await import("../iso/user-settings-view.ts");
    expect(userSettingsView({}, { configUnreadable: VERSIONED_PARSE_FAILURES.schemaRejected }).configUnreadable).toBe(VERSIONED_PARSE_FAILURES.schemaRejected);
    expect(() => {
      Reflect.apply(userSettingsView, undefined, [{}, { configUnreadable: "not-a-failure" }]);
    }).toThrow(ZodError);
  });
});
