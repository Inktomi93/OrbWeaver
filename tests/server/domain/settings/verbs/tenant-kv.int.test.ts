import { expect, test } from "@orb/testkit/node";
import { SETTINGS_OP_CODES } from "#server/domain/settings/contract/errors.ts";

test("the generic settings writer refuses a registered tenant namespace", async ({ services }) => {
  await expect(services.settings.setGlobalSetting("catalog:openrouter", "foreign catalog")).rejects.toMatchObject({ code: SETTINGS_OP_CODES.reservedKey });
  expect(await services.settings.getGlobalSetting("catalog:openrouter")).toBeNull();
});
