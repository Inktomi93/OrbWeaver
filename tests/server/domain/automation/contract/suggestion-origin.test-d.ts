import { expectTypeOf, test } from "vitest";
import type { createSuggestionStore } from "#server/domain/automation/index.ts";

type PendingSuggestion = Parameters<ReturnType<typeof createSuggestionStore>["raise"]>[0];
type SuggestionSource = PendingSuggestion["source"];
type SuggestionPayload = NonNullable<PendingSuggestion["payload"]>;

type Common = Pick<PendingSuggestion, "id" | "chatId" | "actorUserId" | "summary" | "expiresAt">;
type Rule = Extract<SuggestionSource, { kind: "rule" }>;
type Plugin = Extract<SuggestionSource, { kind: "plugin" }>;
type Arm = Extract<SuggestionPayload, { via: "arm" }>;
type Act = Extract<SuggestionPayload, { via: "plugin-act" }>;
test("pending asks cannot swap origin enforcement sets or stash executable invitations", () => {
  expectTypeOf<Common & { kind: "invitation"; source: Rule; payload: Arm }>().not.toExtend<PendingSuggestion>();
  expectTypeOf<Common & { kind: "invitation"; source: Plugin; payload: null }>().not.toExtend<PendingSuggestion>();
  expectTypeOf<Common & { kind: "confirm"; source: Plugin; payload: Arm }>().not.toExtend<PendingSuggestion>();
  expectTypeOf<Common & { kind: "confirm"; source: Rule; payload: Act }>().not.toExtend<PendingSuggestion>();
  expectTypeOf<Common & { kind: "confirm"; source: Rule; payload: null }>().not.toExtend<PendingSuggestion>();
  expectTypeOf<Common & { kind: "invitation"; source: Rule; payload: null }>().toExtend<PendingSuggestion>();
  expectTypeOf<Common & { kind: "confirm"; source: Plugin; payload: Act }>().toExtend<PendingSuggestion>();
  expectTypeOf<Common & { kind: "confirm"; source: Rule; payload: Exclude<SuggestionPayload, Act> }>().toExtend<PendingSuggestion>();
});
