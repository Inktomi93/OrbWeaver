import { expectTypeOf, test } from "vitest";
import type { ConfigSearchEntry } from "#client/features/config/lib/config-search.ts";

test("config search kind determines its navigation address grain", () => {
  type Content = Pick<ConfigSearchEntry, "id" | "label" | "shelf" | "groupId" | "groupLabel" | "advanced" | "keywords">;
  expectTypeOf<Content & { kind: "group"; subId: string; settingId: null }>().not.toExtend<ConfigSearchEntry>();
  expectTypeOf<Content & { kind: "setting"; subId: null; settingId: string }>().not.toExtend<ConfigSearchEntry>();
  expectTypeOf<Content & { kind: "group"; subId: null; settingId: null }>().toExtend<ConfigSearchEntry>();
  expectTypeOf<Content & { kind: "section"; subId: string; settingId: null }>().toExtend<ConfigSearchEntry>();
  expectTypeOf<Content & { kind: "setting"; subId: string; settingId: string }>().toExtend<ConfigSearchEntry>();
});
