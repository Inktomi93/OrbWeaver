// rpg/ front door (UI-Arch §2.1) — the ONLY entry into the rpg client slice (dep-cruiser
// client-feature-front-door). The takeover's CONTEXT-panel SECTION contribution (`makeRpgContextTabs`,
// Context-Panel-Program §4.4) is built at the main.tsx door and merged into chat's `defineContextTabs`
// contributors (§6c) — rpg NEVER imports chat, chat NEVER imports rpg, the door imports both and injects the
// cross-domain read channel (`{ trpc, queryClient }`). This slice imports no other feature; cross-domain
// reads ride `trpc.*` (cache-first, §12).
//
// `makeRpgHudRegion` is the second half of the same door wiring (HUD-1 §3.2): the whole-pane CLAIM that
// makes the CONTEXT panel BE the HUD on an engaged game chat. Same deps, same predicate, same one-directional
// flow — the tabs supply the content, the region supplies the arrangement.

// B8: the two halves of "checks" the door wires into chat's registries —
// the ASK is a game-arm control source (the `chat-controls` band); the RESULT is an in-thread tool renderer
// (the `tool-renderers` registry). rpg NEVER imports chat, chat NEVER imports rpg; the door imports both.
export { rpgDiceAskSource } from "./lib/dice-ask-source.tsx";
export { rpgDiceToolRenderer } from "./lib/dice-tool-renderer.tsx";
export { makeRpgContextTabs } from "./lib/rpg-context-section.tsx";
export type { RpgContextTabsDeps } from "./lib/rpg-game-chat.ts";
export { makeRpgHudRegion } from "./lib/rpg-hud-region.tsx";
// The per-row "what this turn did" disclosure (TOOLCALLS-INVISIBLE, arm A) — a `message-footer` surface
// contribution the door appends to chat's surface registry. The seam's first real tenant.
export { rpgTurnToolCallsSurface } from "./lib/turn-tool-calls-surface.tsx";
