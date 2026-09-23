// automation/ front door (UI-Arch §2.1) — the ONLY entry into the automation slice (dep-cruiser
// `client-feature-front-door`). It exports the S4 suggest/confirm CONTROL SOURCE the door appends to chat's
// `chat-controls` registry, and — B2 — the `automationRulesSection` contribution the chat "This chat" tab
// renders inside its host-controls band (the rule list + enable toggle + Test/Run-now + the "Add rule…" preset picker + fire log).
//
// WHY THE FEATURE EXISTS AT ALL: a control SOURCE and a rules panel are BOTH foreign surfaces grafting onto
// chat's band/tab, and `client-features-no-cross` makes the alternative (putting them inside the chat
// feature) RED. B3's chips still land here too, so the slice is the home the interaction path already
// assumes, not a folder minted for one file.

// #16's NEEDLE METER is the third graft, and the first onto the transcript itself: a `thread-flank`
// contribution rendering the tension score the needle preset publishes into this room's chat variables.
//
// It also owns the Automation CONFIG GROUP, moved here from `features/settings` with A4 for two reasons
// that agree: the `feature-owns-definition` gate requires a feature dir to own a registered definition, and
// the group IS automation's surface (spec §3-S3 names it as the owner-global rules home when C5 lands).

export type { ClockMeterProps } from "./components/clock-meter.tsx";
export { ClockMeter } from "./components/clock-meter.tsx";
export type { NeedleMeterProps } from "./components/needle-meter.tsx";
export { NeedleMeter } from "./components/needle-meter.tsx";
export { RulesSection } from "./components/rules-section.tsx";
export { automationActivityTab } from "./lib/activity-context-tab.tsx";
export type { PendingAsk } from "./lib/apply-automation-bus-event.ts";
export { applyAutomationBusEvent, pruneExpiredAsks } from "./lib/apply-automation-bus-event.ts";
// C5 — the Automation config group's two contributed SECTIONS: the owner-global
// rule list + picker, and the owner rate ceiling. Assembled at the door; the CT mounts them through their defs.
export { automationBudgetSection } from "./lib/automation-budget-section.tsx";
export { automationGroup } from "./lib/automation-group.tsx";
export { automationLibraryRulesSection } from "./lib/automation-library-rules-section.tsx";
export { automationClockMeterSurface } from "./lib/clock-meter-surface.tsx";
export { automationNeedleMeterSurface } from "./lib/needle-meter-surface.tsx";
export { automationQuickReplySource } from "./lib/quick-reply-control-source.ts";
export { automationRulesSection } from "./lib/rules-settings-section.tsx";
export { automationSuggestionSource } from "./lib/suggestion-control-source.ts";
