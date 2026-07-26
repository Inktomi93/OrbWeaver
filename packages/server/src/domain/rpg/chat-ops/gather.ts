// domain/rpg/chat-ops/gather — the game turn's GATHER (rpg-design/05 §4.7 + the delivery-model amendment §4.6).
// Produces the generic gather contribution chat merges STRUCTURALLY: `{ macros, injections, tools }` (chat
// names no rpg type). A non-game chat returns `null` → byte-identical no-op (the existing contract-test
// pattern). PRINCIPAL-FREE: chat already gated the turn's caller; the gather resolves game-ness by the row.
//
// THE extractionMode BRANCH (the amendment): the reminder injection rides BOTH modes; the tool set does NOT.
//   • cheap    — the §4.5 state tools ride the CHARACTER turn: the gather returns the tool NAMES (the DEFS are
//                W1c — the gather returns names, the registry attaches them). Update-guidance is ON.
//   • reliable — NO tools; a dedicated structured-output extraction fires at `onTurnCompleted` (the injected
//                `runExtraction` op). Update-guidance is OFF (the model is never asked to call a tool).
//   • readonly/manual-steering — the resolved mode's writer capability is ABSENT (`trackersReadOnly`): NO
//     tools, NO extraction, guidance OFF. The host hand-edits every plane, and those hand values STILL steer
//     via THIS reminder (the honest degrade is DESIGNED, §4.6 — never a silent mode-downgrade).
//
// The reminder reads the SAME `buildTrackerView` projection the CP panel renders, so the injection and the
// panel never drift. `resolveTrackersReadOnly` is the ONE per-turn capability read (already resolved for THIS
// game's `extractionMode` by the integration op) — the gather reuses its verdict, never re-resolving.

import type { ChatInjection } from "@orb/contracts/chat";
import type { RpgExtractionMode } from "@orb/contracts/rpg";
import { MODE_POLICY } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import type { RpgGatherResult } from "../contract/params";
import type { RpgContext, RpgGameRow } from "../contract/service";
import { findGameByChat } from "../persistence/games";
import { buildLiteReminder } from "../substrate/reminder";
import { buildTrackerView } from "./tracker-view";

/** Whether the resolved mode attaches in-turn tools (cheap + a live tool-write capability). Reliable never
 *  attaches tools (its extraction fires post-turn); readonly attaches none. */
function attachesTools(mode: RpgExtractionMode, trackersReadOnly: boolean): boolean {
  return mode === "cheap" && !trackersReadOnly;
}

export async function gatherTurnContext(ctx: RpgContext, chatId: ChatId): Promise<RpgGatherResult | null> {
  const game: RpgGameRow | undefined = await findGameByChat(ctx.db, chatId);
  if (game === undefined) {
    return null; // non-game chat — byte-identical no-op
  }

  const trackersReadOnly = await ctx.resolveTrackersReadOnly(chatId);
  const mode = game.config.extractionMode;
  const toolCapable = attachesTools(mode, trackersReadOnly);

  const view = await buildTrackerView(ctx, game, trackersReadOnly);
  const reminder = buildLiteReminder({ view, toolCapable, steeringNote: game.config.lite.steeringNote });

  const injection: ChatInjection = { position: "in_chat", depth: 0, role: "system", content: reminder };
  const tools = toolCapable ? [...MODE_POLICY[game.mode].tools] : [];

  return { macros: {}, injections: [injection], tools };
}
