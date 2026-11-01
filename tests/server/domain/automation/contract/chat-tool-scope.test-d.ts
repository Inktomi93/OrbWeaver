// @subject packages/server/src/domain/automation/contract/runtime-ops.ts
import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { AutomationRuntimeDeps } from "#server/domain/automation/contract/runtime-ops.ts";
import type { DrivableToolSet, ResolvedToolSet, ToolDefinition, ToolUseService } from "#server/domain/tool-use/index.ts";

type AutomationToolUse = AutomationRuntimeDeps<DrivableToolSet>["toolUse"];
type OffTurnExec = Parameters<AutomationToolUse["executeToolCalls"]>[2];
type OffTurnToolUse = Pick<ToolUseService, keyof AutomationToolUse>;

declare const offTurnToolUse: OffTurnToolUse;
declare const executeToolCalls: ToolUseService["executeToolCalls"];
declare const offTurnExec: OffTurnExec;
declare const drivableSet: DrivableToolSet;
declare const resolvedSet: ResolvedToolSet;
declare const toolDefinition: ToolDefinition;

test("a first-party handler reads a non-null chat and turn without narrowing", () => {
  type Exec = Parameters<ToolDefinition["handler"]>[1];
  expectTypeOf<Exec["chatId"]>().toEqualTypeOf<ChatId>();
  expectTypeOf<Exec["turnId"]>().toEqualTypeOf<ChatTurnId>();
});

test("automation's seam accepts the drivable set and refuses a set that can hold first-party entries", () => {
  const accepted: AutomationToolUse = offTurnToolUse;
  expectTypeOf(accepted).toBeObject();
  // @ts-expect-error a set that may hold chat-scoped handlers cannot flow to the off-turn execute
  const refused: AutomationRuntimeDeps<ResolvedToolSet>["toolUse"] = offTurnToolUse;
  expectTypeOf(refused).toBeObject();
});

test("execute refuses a nullable context for a chat-scoped set and takes it for a drivable set", () => {
  expectTypeOf(executeToolCalls(drivableSet, [], offTurnExec)).toBeObject();
  // @ts-expect-error a chat-scoped set demands non-null `chatId` and `turnId`
  expectTypeOf(executeToolCalls(resolvedSet, [], offTurnExec)).toBeObject();
});

test("a compose-time definition cannot claim a contributor source", () => {
  // @ts-expect-error only `registerPluginTool` mints a plugin entry
  const refused: ToolDefinition = { ...toolDefinition, source: "plugin" };
  expectTypeOf(refused).toBeObject();
});
