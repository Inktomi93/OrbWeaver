import { expect, test } from "@orb/testkit/node";

test("the generic settings writer refuses a registered tenant namespace", async ({ services }) => {
  await expect(services.settings.setGlobalSetting("catalog:openrouter", "foreign catalog")).rejects.toMatchObject({ code: "reserved_key" });
  expect(await services.settings.getGlobalSetting("catalog:openrouter")).toBeNull();
});
