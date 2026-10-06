import { responseCacheControlSchema, responseCacheSettingsSchema } from "../../../packages/contracts/src/preset/response-cache.ts";
import { expect, test } from "../../support/fixtures.ts";

test("response replay controls reject invalid retention without accepting a partial setting", () => {
  expect(responseCacheSettingsSchema.parse({ enabled: false })).toEqual({ enabled: false });
  expect(responseCacheSettingsSchema.parse({ enabled: true, ttlSeconds: 86_400 })).toEqual({ enabled: true, ttlSeconds: 86_400 });
  for (const ttlSeconds of [0, 86_401, 1.5, "60abc"]) {
    expect(responseCacheSettingsSchema.safeParse({ enabled: true, ttlSeconds }).success).toBe(false);
  }
  expect(responseCacheSettingsSchema.safeParse({ ttlSeconds: 60 }).success).toBe(false);
  expect(responseCacheControlSchema.parse({ enabled: false, refresh: false })).toEqual({ enabled: false, refresh: false });
  expect(responseCacheControlSchema.parse({ ttlSeconds: 1, refresh: true })).toEqual({ ttlSeconds: 1, refresh: true });
  expect(responseCacheControlSchema.safeParse({ clearAll: true }).success).toBe(false);
});
