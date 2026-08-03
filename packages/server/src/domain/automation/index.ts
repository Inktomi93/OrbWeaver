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
} from "./contract/errors.ts";
export type {
  ArmDispatch,
  ArmExecutorDeps,
  ArmOutcome,
  AutomationImageRequest,
  AutomationImageResult,
  AutomationOps,
  AutomationTurnRequest,
  AutomationTurnResult,
  BackgroundChoice,
  DispatchFrame,
  EmitAutomationEvent,
  EnabledRuleIndex,
  PromptTransformIndex,
  PromptTransformIndexDeps,
  ResolveAuthorPrincipal,
  TurnOriginRead,
} from "./contract/ops.ts";
export type {
  CreateRuleParams,
  DeleteGlobalVariableParams,
  DeleteRuleParams,
  GetBudgetsParams,
  GetGlobalVariableParams,
  ListFiresParams,
  ListGlobalVariablesParams,
  ListRulesParams,
  ReorderRulesParams,
  SetBudgetsParams,
  SetGlobalVariableParams,
  SetRuleEnabledParams,
  TestRuleParams,
  UpdateRuleParams,
} from "./contract/params.ts";
export type { PluginSubscriberRegistry, PluginTriggerSubscriber } from "./contract/plugin-subscribers.ts";
export type { ArmPreview, FireView, RuleView, StreamAuthority, TestRunResult } from "./contract/results.ts";
export type { AutomationService, AutomationWatcherEnv, AutomationWatcherHandle } from "./contract/service.ts";
export type { BudgetView, GlobalVariableView } from "./contract/views.ts";
export { createArmExecutors } from "./engine/arm-executors.ts";
export { createPromptTransformIndex } from "./engine/prompt-transforms.ts";
export { loadPresentHumanMemberIds } from "./persistence/canon-reads.ts";
export { createAutomationService } from "./service.ts";
export { createEnabledRuleIndex } from "./substrate/enabled-index.ts";
export { createPluginSubscriberRegistry } from "./substrate/plugin-subscribers.ts";
export { startAutomationWatcher } from "./watcher/start-automation-watcher.ts";
