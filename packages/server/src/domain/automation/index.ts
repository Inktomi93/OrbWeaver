// domain/automation — front door (the only legal external import). The A3 global-variable slice + the A4
// rule/budget/fire/lifecycle surface + the A5 watcher/dispatch subsystem behind ONE door. A sibling domain
// never runtime-imports automation's internals sideways — the composition root injects the built
// `AutomationService` + the watcher env. A6 wires the injected `runArm` dispatcher — through this same door.

export type { AutomationContext } from "./context.ts";
export {
  AutomationChatNotFoundError,
  AutomationReservedTriggerError,
  BudgetValidationError,
  GlobalVariableInvalidError,
  RuleNotFoundError,
  RuleReorderError,
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
  GetGlobalVariableParams,
  ListFiresParams,
  ListGlobalVariablesParams,
  ListRulesParams,
  ReorderRulesParams,
  RulePresetProvenance,
  RunRuleNowParams,
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
export type { GlobalVariableView } from "./contract/views.ts";
export { createArmExecutors } from "./engine/arm-executors.ts";
export { createPromptTransformIndex } from "./engine/prompt-transforms.ts";
// The #1391 plugin tool wire-name rewrite over the `run_tool` arm inside `automation_rules.actions` — a
// boot step (`entry/boot/migrate-plugin-tool-wire-names`) runs it; automation owns it because it owns the table.
export { migratePluginToolWireNames } from "./persistence/migrate-plugin-tool-wire-names.ts";
export { createAutomationService } from "./service.ts";
export { createEnabledRuleIndex } from "./substrate/enabled-index.ts";
// The recipient AXIS's one resolver — the front door for the PLUGIN `notify` path, which compose wires to the
// same durable inbox the `post_notification` arm writes (one axis, one resolution, both producers).
export { resolveNotificationRecipients } from "./substrate/notification-recipients.ts";
export { createPluginSubscriberRegistry } from "./substrate/plugin-subscribers.ts";
// B10 — the saved-cast capture belt: roster-preset's compose seam injects this so a cast stores only
// bags the catalogue itself validated (chat-scope only, full descriptor resolution). One home for the
// knob law; the caller never re-derives it.
export { resolveChatRulePresetKnobs } from "./substrate/presets.ts";
// S4 — the in-RAM pending-ask store (RULED F1). Created ONCE at the composition root and injected on the
// context, exactly like the enabled-rule index beside it.
export { AUTOMATION_SUGGESTION_TTL_MS, createPluginSuggestionRaiser, createSuggestionStore } from "./substrate/suggestions.ts";
// S5 — the guidance-delivery teaching contribution (the D145 root slot's third occupant). Front-door ONLY:
// `entry/compose` registers it onto `ChatContext.teaching`; the cruiser stanza forbids every other importer.
export { createAutomationTeachingContributions } from "./teaching-contribution.ts";
export { startAutomationWatcher } from "./watcher/start-automation-watcher.ts";
