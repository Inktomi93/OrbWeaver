// automation/ front door (UI-Arch §2.1) — the ONLY entry into the automation slice (dep-cruiser
// `client-feature-front-door`). It exports the S4 suggest/confirm CONTROL SOURCE the door appends to chat's
// `chat-controls` registry, and — B2 — the `automationRulesSection` contribution the chat "This chat" tab
// renders inside its host-controls band (the rule list + enable toggle + Test/Run-now + the "Add rule…" preset picker + fire log).
//
// WHY THE FEATURE EXISTS AT ALL: a control SOURCE and a rules panel are BOTH foreign surfaces grafting onto
// chat's band/tab, and `client-features-no-cross` makes the alternative (putting them inside the chat
// feature) RED. B3's chips still land here too, so the slice is the home the interaction path already
// assumes, not a folder minted for one file.

// It also owns the Automation SETTINGS PANE, moved here from `features/settings` with A4 for two reasons
// that agree: the `feature-owns-definition` gate requires a feature dir to own a registered definition, and
// the pane IS automation's surface (spec §3-S3 names it as the owner-global rules home when C5 lands).

export { RulesSection } from "./components/rules-section.tsx";
export type { PendingAsk } from "./lib/apply-automation-bus-event.ts";
export { applyAutomationBusEvent, pruneExpiredAsks } from "./lib/apply-automation-bus-event.ts";
export { automationPane } from "./lib/automation-pane.tsx";
export { automationQuickReplySource } from "./lib/quick-reply-control-source.ts";
export { automationRulesSection } from "./lib/rules-settings-section.tsx";
export { automationSuggestionSource } from "./lib/suggestion-control-source.ts";
