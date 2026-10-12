import type { RequestTurnOp, ToolCallRecord, TurnInitiator } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { GeneratePicture } from "@orb/contracts/imagery";
import type { UserSettingsView } from "@orb/contracts/settings";
import type { BindingActor, ChatToolDefinition, RoleClientsWithSignal, SideGenSampling, ToolCallInput } from "@orb/inference";
import type { AssetId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import type { AutomationOps, ListRuleTools } from "./ops.ts";

export interface AutomationRuntimeDeps<TSet> {
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  readonly requestTurn: RequestTurnOp;
  readonly postNarratorMessage: (
    chatId: ChatId,
    content: string,
    media?: readonly AssetId[],
    options?: { readonly initiator: TurnInitiator; readonly automationDepth: number } | undefined,
  ) => Promise<{ readonly messageId: MessageId; readonly variantId: MessageVariantId }>;
  readonly imagery: { readonly generatePicture: GeneratePicture };
  readonly settings: { readonly getUserSettings: (params: { readonly principal: Principal }) => Promise<UserSettingsView> };
  readonly toolUse: {
    readonly isToolDrivableBy: (name: string, userId: UserId) => boolean;
    readonly listDrivableToolNames: (userId: UserId) => readonly string[];
    readonly resolveTools: (driverUserId: UserId, names: readonly string[]) => TSet;
    readonly toToolDefinitions: (set: TSet) => readonly ChatToolDefinition[];
    readonly executeToolCalls: (
      set: TSet,
      calls: readonly ToolCallInput[],
      exec: { readonly principal: Principal; readonly triggeredBy: UserId; readonly chatId: ChatId | null; readonly turnId: null; readonly membership: null },
    ) => Promise<readonly ToolCallRecord[]>;
  };
  readonly roleClientsFor: (funderUserId: UserId, actor?: BindingActor) => Promise<RoleClientsWithSignal>;
  readonly resolveUtilityPresetParams: (userId: UserId) => Promise<SideGenSampling | undefined>;
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
