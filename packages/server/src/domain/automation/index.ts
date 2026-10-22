// domain/automation — front door (the only legal external import). The A3 global-variable slice + the A4
// rule/budget/fire/lifecycle surface + the A5 watcher/dispatch subsystem behind ONE door. A sibling domain
// never runtime-imports automation's internals sideways — the composition root injects the built
// `AutomationService` + the watcher env. A6 wires the injected `runArm` dispatcher — through this same door.

export type { RuleView } from "@orb/contracts/automation";

export type {
  AutomationImageRequest,
  AutomationImageResult,
  AutomationOps,
  AutomationTurnRequest,
  AutomationTurnResult,
  BackgroundChoice,
} from "./contract/ops.ts";

// S3 — the preset catalogue's domain half. Only the shapes are exported; the registry and the CEL sources it
// builds stay behind the mint verb.
export type { RulePresetKnobOverrides } from "./contract/presets.ts";

export type { AutomationService, AutomationWatcherEnv } from "./contract/service.ts";

export { createPromptTransformIndex } from "./engine/prompt-transforms.ts";
// The #1391 plugin tool wire-name rewrite over the `run_tool` arm inside `automation_rules.actions` — a
// boot step (`entry/boot/migrate-plugin-tool-wire-names`) runs it; automation owns it because it owns the table.
export { migratePluginToolWireNames } from "./persistence/migrate-plugin-tool-wire-names.ts";
export { createRuleOwnedBy } from "./persistence/rule-owned.ts";
export { createAutomationService } from "./service.ts";
export { createEnabledRuleIndex } from "./substrate/enabled-index.ts";

export { createPluginSubscriberRegistry } from "./substrate/plugin-subscribers.ts";
// B10 — the saved-cast capture belt: roster-preset's compose seam injects this so a cast stores only
// bags the catalogue itself validated (chat-scope only, full descriptor resolution). One home for the
// knob law; the caller never re-derives it.
export { resolveChatRulePresetKnobs } from "./substrate/presets.ts";
// S4 — the in-RAM pending-ask store (RULED F1). Created ONCE at the composition root and injected on the
// context, exactly like the enabled-rule index beside it.
export { createPluginSuggestionRaiser, createSuggestionStore } from "./substrate/suggestions.ts";
// S5 — the guidance-delivery teaching contribution (the D145 root slot's third occupant). Front-door ONLY:
// `entry/compose` registers it onto `ChatContext.teaching`; the cruiser stanza forbids every other importer.
export { createAutomationTeachingContributions } from "./teaching-contribution.ts";
export { createPluginFeedbackOps } from "./verbs/plugin-feedback.ts";
export { createAutomationRuntimeOps } from "./verbs/runtime-ops.ts";
export { startAutomationWatcher } from "./watcher/start-automation-watcher.ts";
