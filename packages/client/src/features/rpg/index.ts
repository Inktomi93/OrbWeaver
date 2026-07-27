// rpg/ front door (UI-Arch §2.1) — the ONLY entry into the rpg client slice (dep-cruiser
// client-feature-front-door). The takeover's CONTEXT-panel SECTION contribution (`makeRpgContextTabs`,
// Context-Panel-Program §4.4) is built at the main.tsx door and merged into chat's `defineContextTabs`
// contributors (§6c) — rpg NEVER imports chat, chat NEVER imports rpg, the door imports both and injects the
// cross-domain read channel (`{ trpc, queryClient }`). This slice imports no other feature; cross-domain
// reads ride `trpc.*` (cache-first, §12).

export type { RpgContextTabsDeps } from "./lib/rpg-context-section";
export { makeRpgContextTabs } from "./lib/rpg-context-section";
