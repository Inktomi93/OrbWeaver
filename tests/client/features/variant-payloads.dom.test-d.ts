import { expectTypeOf, test } from "vitest";
import type { ConfigSearchEntry } from "#client/features/config/lib/config-search.ts";
import type { ReasoningControl } from "#client/features/preset/lib/capability-panel-model.ts";

test("reasoning controls correlate kind and capability without inventing a budget range", () => {
  expectTypeOf<{ kind: "none"; reasons: true }>().not.toExtend<ReasoningControl>();
  expectTypeOf<{ kind: "effort"; reasons: true }>().not.toExtend<ReasoningControl>();
  expectTypeOf<{ kind: "effort"; reasons: true; effortLevels: [] }>().toExtend<ReasoningControl>();
  expectTypeOf<{ kind: "budget"; reasons: true }>().toExtend<ReasoningControl>();
  expectTypeOf<{ kind: "adaptive"; reasons: true; effortLevels: [] }>().not.toExtend<ReasoningControl>();
});

test("config search kind determines its navigation address grain", () => {
  type Content = Pick<ConfigSearchEntry, "id" | "label" | "shelf" | "groupId" | "groupLabel" | "advanced" | "keywords">;
  expectTypeOf<Content & { kind: "group"; subId: string; settingId: null }>().not.toExtend<ConfigSearchEntry>();
  expectTypeOf<Content & { kind: "setting"; subId: null; settingId: string }>().not.toExtend<ConfigSearchEntry>();
  expectTypeOf<Content & { kind: "group"; subId: null; settingId: null }>().toExtend<ConfigSearchEntry>();
  expectTypeOf<Content & { kind: "section"; subId: string; settingId: null }>().toExtend<ConfigSearchEntry>();
  expectTypeOf<Content & { kind: "setting"; subId: string; settingId: string }>().toExtend<ConfigSearchEntry>();
});
