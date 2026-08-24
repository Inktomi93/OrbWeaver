// automation/ front door (UI-Arch §2.1) — the ONLY entry into the automation slice (dep-cruiser
// `client-feature-front-door`). Today it exports exactly one thing: the S4 suggest/confirm CONTROL SOURCE
// the door appends to chat's `chat-controls` registry.
//
// WHY THE FEATURE EXISTS AT ALL, given how small it is: a control SOURCE is a foreign feature grafting onto
// chat's band, and `client-features-no-cross` makes the alternative (putting automation's card inside the
// chat feature) RED. This is also where B2's rules panel and B3's chips land, so the slice is the home the
// interaction path already assumes, not a folder minted for one file.

// It also owns the Automation SETTINGS PANE, moved here from `features/settings` with A4 for two reasons
// that agree: the `feature-owns-definition` gate requires a feature dir to own a registered definition, and
// the pane IS automation's surface (spec §3-S3 names it as the owner-global rules home when C5 lands).

export type { PendingAsk } from "./lib/apply-automation-bus-event.ts";
export { applyAutomationBusEvent, pruneExpiredAsks } from "./lib/apply-automation-bus-event.ts";
export { automationPane } from "./lib/automation-pane.tsx";
export { automationSuggestionSource } from "./lib/suggestion-control-source.ts";
