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
// It also owns the Automation SETTINGS PANE, moved here from `features/settings` with A4 for two reasons
// that agree: the `feature-owns-definition` gate requires a feature dir to own a registered definition, and
// the pane IS automation's surface (spec §3-S3 names it as the owner-global rules home when C5 lands).

export type { NeedleMeterProps } from "./components/needle-meter.tsx";
export { NeedleMeter } from "./components/needle-meter.tsx";
/** C5 — the Automation settings pane's BODY. Exported for the pane definition's own `render` (which is in
 *  this feature) and for its CT story; nothing outside the feature mounts it directly. */
export { OwnerAutomationSurface } from "./components/owner-rules-surface.tsx";
export { RulesSection } from "./components/rules-section.tsx";
export type { PendingAsk } from "./lib/apply-automation-bus-event.ts";
export { applyAutomationBusEvent, pruneExpiredAsks } from "./lib/apply-automation-bus-event.ts";
export { automationPane } from "./lib/automation-pane.tsx";
export { automationNeedleMeterSurface } from "./lib/needle-meter-surface.tsx";
export { automationQuickReplySource } from "./lib/quick-reply-control-source.ts";
export { automationRulesSection } from "./lib/rules-settings-section.tsx";
export { automationSuggestionSource } from "./lib/suggestion-control-source.ts";
