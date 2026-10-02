import { attachmentQualitySchema, DEFAULT_ATTACHMENT_QUALITY, IMAGE_DETAILS, VIDEO_MAX_RESOLUTIONS } from "@orb/contracts/inference";
import type { UserSettingsView } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION, userSettingsConfig, userSettingsViewSchema } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const baseView: UserSettingsView = {
  userId: newId<UserId>(),
  schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
  configUnreadable: null,
};

test("missing and invalid stored quality values heal independently to canonical defaults", () => {
  expect(DEFAULT_ATTACHMENT_QUALITY).toEqual({ imageDetail: "auto", videoMaxResolution: "720" });
  expect(DEFAULT_USER_SETTINGS.chat.attachmentQuality).toEqual(DEFAULT_ATTACHMENT_QUALITY);
  expect(attachmentQualitySchema.parse({ imageDetail: "invalid", videoMaxResolution: "original" })).toEqual({
    imageDetail: "auto",
    videoMaxResolution: "original",
  });
  expect(attachmentQualitySchema.parse({ imageDetail: "high", videoMaxResolution: "invalid" })).toEqual({ imageDetail: "high", videoMaxResolution: "720" });
});

test("every ruled quality combination survives storage parsing and the canonical user settings output", () => {
  for (const imageDetail of IMAGE_DETAILS) {
    for (const videoMaxResolution of VIDEO_MAX_RESOLUTIONS) {
      const quality = { imageDetail, videoMaxResolution };
      expect(attachmentQualitySchema.parse(quality)).toEqual(quality);
      const config = userSettingsConfig.parse(
        { ...DEFAULT_USER_SETTINGS, chat: { ...DEFAULT_USER_SETTINGS.chat, attachmentQuality: quality } },
        USER_SETTINGS_SCHEMA_VERSION,
      );
      expect(config.chat.attachmentQuality).toEqual(quality);
      expect(userSettingsViewSchema.parse({ ...baseView, config }).config.chat.attachmentQuality).toEqual(quality);
    }
  }
});

test("stored attachment quality strips extra fields while the typed user settings output refuses them", () => {
  const quality = { imageDetail: "high", videoMaxResolution: "480" } as const;
  const widened = { ...quality, privateTypedField: "secret" };
  expect(attachmentQualitySchema.parse(widened)).toEqual(quality);
  const config = { ...DEFAULT_USER_SETTINGS, chat: { ...DEFAULT_USER_SETTINGS.chat, attachmentQuality: widened } };
  expect(userSettingsConfig.parse(config, USER_SETTINGS_SCHEMA_VERSION).chat.attachmentQuality).toEqual(quality);
  const output: UserSettingsView = { ...baseView, config };
  expect(userSettingsViewSchema.safeParse(output).success).toBe(false);
});
