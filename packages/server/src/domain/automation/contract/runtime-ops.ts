import type { RequestTurnOp, ToolCallRecord, TurnInitiator } from "@orb/contracts/chat";
import type { Principal, ResolveHostPrincipalOp } from "@orb/contracts/identity";
import type { GeneratePicture } from "@orb/contracts/imagery";
import type { ResolveUtilityPresetParams } from "@orb/contracts/preset";
import type { GetUserSettingsOp } from "@orb/contracts/settings";
import type { IsToolDrivableByOp, ListDrivableToolNamesOp, ResolveToolsOp } from "@orb/contracts/tool-use";
import type { BindingActor, ChatToolDefinition, RoleClientsWithSignal, ToolCallInput } from "@orb/inference";
import type { AssetId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import type { AutomationOps, ListRuleTools } from "./ops.ts";

export interface AutomationRuntimeDeps<TSet> {
  readonly resolveOwnerPrincipal: ResolveHostPrincipalOp;
  readonly requestTurn: RequestTurnOp;
  readonly postNarratorMessage: (
    chatId: ChatId,
    content: string,
    media?: readonly AssetId[],
    options?: { readonly initiator: TurnInitiator; readonly automationDepth: number } | undefined,
  ) => Promise<{ readonly messageId: MessageId; readonly variantId: MessageVariantId }>;
  readonly imagery: { readonly generatePicture: GeneratePicture };
  readonly settings: { readonly getUserSettings: GetUserSettingsOp };
  readonly toolUse: {
    readonly isToolDrivableBy: IsToolDrivableByOp;
    readonly listDrivableToolNames: ListDrivableToolNamesOp;
    readonly resolveTools: ResolveToolsOp<TSet>;
    readonly toToolDefinitions: (set: TSet) => readonly ChatToolDefinition[];
    readonly executeToolCalls: (
      set: TSet,
      calls: readonly ToolCallInput[],
      exec: { readonly principal: Principal; readonly triggeredBy: UserId; readonly chatId: ChatId | null; readonly turnId: null; readonly membership: null },
    ) => Promise<readonly ToolCallRecord[]>;
  };
  readonly roleClientsFor: (funderUserId: UserId, actor?: BindingActor) => Promise<RoleClientsWithSignal>;
  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;
  readonly newToolCallId: () => string;
}
export interface AutomationRuntimeOps {
  readonly requestTurn: AutomationOps["chat"]["requestTurn"];
  readonly generatePicture: AutomationOps["imagery"]["generatePicture"];
  readonly listBackgroundChoices: AutomationOps["chat"]["listBackgroundChoices"];
  readonly runTool: AutomationOps["tools"]["runTool"];
  readonly summarizeQuiet: AutomationOps["summarizeQuiet"];
  readonly listRuleTools: ListRuleTools;
}
