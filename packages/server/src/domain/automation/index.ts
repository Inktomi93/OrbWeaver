// domain/automation — front door (the only legal external import). The A3 global-variable slice + the A4
// rule/budget/fire/lifecycle surface + the A5 watcher/dispatch subsystem behind ONE door. A sibling domain
// never runtime-imports automation's internals sideways — the composition root injects the built
// `AutomationService` + the watcher env. A6 wires the injected `runArm` dispatcher — through this same door.

export type { AutomationContext } from "./context";
export {
  AutomationChatNotFoundError,
  AutomationReservedTriggerError,
  GlobalVariableInvalidError,
  RuleNotFoundError,
  RuleValidationError,
} from "./contract/errors";
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
} from "./contract/ops";
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
} from "./contract/params";
export type { PluginSubscriberRegistry, PluginTriggerSubscriber } from "./contract/plugin-subscribers";
export type { ArmPreview, FireView, RuleView, StreamAuthority, TestRunResult } from "./contract/results";
export type { AutomationService, AutomationWatcherEnv, AutomationWatcherHandle } from "./contract/service";
export type { BudgetView, GlobalVariableView } from "./contract/views";
export { createArmExecutors } from "./engine/arm-executors";
export { createPromptTransformIndex } from "./engine/prompt-transforms";
export { loadPresentHumanMemberIds } from "./persistence/canon-reads";
export { createAutomationService } from "./service";
export { createEnabledRuleIndex } from "./substrate/enabled-index";
export { createPluginSubscriberRegistry } from "./substrate/plugin-subscribers";
export { startAutomationWatcher } from "./watcher/start-automation-watcher";
