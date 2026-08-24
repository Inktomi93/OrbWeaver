// domain/automation — front door (the only legal external import). The A3 global-variable slice + the A4
// rule/budget/fire/lifecycle surface + the A5 watcher/dispatch subsystem behind ONE door. A sibling domain
// never runtime-imports automation's internals sideways — the composition root injects the built
// `AutomationService` + the watcher env. A6 wires the injected `runArm` dispatcher — through this same door.

export type { AutomationContext } from "./context.ts";
export {
  AutomationChatNotFoundError,
  AutomationReservedTriggerError,
  GlobalVariableInvalidError,
  RuleNotFoundError,
  RuleValidationError,
  SuggestionNotFoundError,
  SuggestionRefusedError,
} from "./contract/errors.ts";
export type {
  ArmDispatch,
  ArmExecutorDeps,
  ArmOutcome,
  AutomationImageRequest,
  AutomationImageResult,
  AutomationOps,
  AutomationToolOutcome,
  AutomationToolRequest,
  AutomationTurnRequest,
  AutomationTurnResult,
  BackgroundChoice,
  DispatchFrame,
  EmitAutomationEvent,
  EnabledRuleIndex,
  ExecutePluginSuggestion,
  IsPluginLive,
  PendingSuggestion,
  PromptTransformIndex,
  PromptTransformIndexDeps,
  ResolveAuthorPrincipal,
  StashedArm,
  SuggestionStore,
  TurnOriginRead,
} from "./contract/ops.ts";
export type {
  ConfirmSuggestionParams,
  CreateRuleFromPresetParams,
  CreateRuleParams,
  DeleteGlobalVariableParams,
  DeleteRuleParams,
  DismissSuggestionParams,
  GetBudgetsParams,
  GetGlobalVariableParams,
  ListFiresParams,
  ListGlobalVariablesParams,
  ListRulesParams,
  ReorderRulesParams,
  RunRuleNowParams,
  SetBudgetsParams,
  SetGlobalVariableParams,
  SetRuleEnabledParams,
  TestRuleParams,
  UpdateRuleParams,
} from "./contract/params.ts";
export type { PluginSubscriberRegistry, PluginTriggerSubscriber } from "./contract/plugin-subscribers.ts";
// S3 — the preset catalogue's domain half. The REGISTRY is exported for the transport/test surfaces that
// need to name a preset's shape; the CEL sources it builds stay behind the mint verb.
export type { ErasedRulePresetDef, RulePresetDef, RulePresetKnobOverrides, RulePresetRuleDef } from "./contract/presets.ts";
export { RULE_PRESETS } from "./contract/presets.ts";
export type { ArmPreview, ConfirmSuggestionResult, FireView, RuleView, RunRuleNowResult, StreamAuthority, TestRunResult } from "./contract/results.ts";
export type { AutomationService, AutomationWatcherEnv, AutomationWatcherHandle } from "./contract/service.ts";
export type { BudgetView, GlobalVariableView } from "./contract/views.ts";
export { createArmExecutors } from "./engine/arm-executors.ts";
export { createPromptTransformIndex } from "./engine/prompt-transforms.ts";
export { loadPresentHumanMemberIds } from "./persistence/canon-reads.ts";
export { createAutomationService } from "./service.ts";
export { createEnabledRuleIndex } from "./substrate/enabled-index.ts";
export { createPluginSubscriberRegistry } from "./substrate/plugin-subscribers.ts";
// S4 — the in-RAM pending-ask store (RULED F1). Created ONCE at the composition root and injected on the
// context, exactly like the enabled-rule index beside it.
export { AUTOMATION_SUGGESTION_TTL_MS, createPluginSuggestionRaiser, createSuggestionStore } from "./substrate/suggestions.ts";
export { startAutomationWatcher } from "./watcher/start-automation-watcher.ts";
