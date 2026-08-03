// domain/rpg/verbs/read/reveal-hidden — revealHidden (parity-plus §3.6). The HOST-REVEAL "eye": the parsed
// hidden `<lie>`/`<ofilter>` content of a game's assistant transcript + the standing-lie inventory. A READ over
// the STORED bodies (derive-from-bodies, owner-ruled — NO new table): it tokenizes the hidden spans the member
// STRIP removed and projects them for the host.
//
// THE TRUST BOUNDARY (§3.6, the reason this is a dedicated read): hidden content is a GM-plane secret. It is
// SERVER-STRIPPED from a member's message payload (`domain/chat` member-visibility) — a member never receives
// the truth bytes. The reveal is a SEPARATE host-gated read so the truth is served ONLY to the host, never
// bundled into the payload every member gets. HOST-gated here via `resolveHost` (the roster host check every
// shared-plane rpg verb uses): a member gets the SAME leak-free NOT_FOUND a no-game chat gives (the cross-tenant
// belt — a non-host must not even learn the game has hidden content). The bodies read is chat-scoped by the
// `messages.chatId` join (D108 carve #1 — a foreign message is unreachable).
//
// M4 (`config.features.hiddenContentReveal`, default true): when the host turned the reveal OFF, they run PURE
// hidden — no eye even for themselves. The verb then returns EMPTY (the parsed content is withheld from the host
// too); the hidden content STILL rides the wire (the model remembers) and is STILL member-stripped — only the
// host's own peek is withheld. This is a host-of-room posture, NOT a security relaxation.

import type { RpgRevealView } from "@orb/contracts/rpg";
import type { ReadGameParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveHost } from "../../guard.ts";
import { listSelectedAssistantBodies } from "../../persistence/reveal.ts";
import { buildRevealView } from "../../substrate/reveal.ts";

/** The empty reveal — returned when M4 (`hiddenContentReveal`) is off (the host opted out of the eye). */
const EMPTY_REVEAL: RpgRevealView = { messages: [], standingLies: [] };

export function createRevealHidden(ctx: RpgContext): Pick<RpgService, "revealHidden"> {
  async function revealHidden(params: ReadGameParams): Promise<RpgRevealView> {
    // HOST gate (leak-free): a non-host/non-member gets NOT_FOUND — they never learn the game has hidden content.
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    // M4: the host may run PURE hidden (no reveal eye even for themselves). Withhold the parsed content — the
    // wire still carries it (the model remembers), the member strip still removes it; only the host's peek is off.
    if (!game.config.features.hiddenContentReveal) {
      return EMPTY_REVEAL;
    }
    // Derive-from-bodies (no new table): the chat-scoped selected-variant assistant transcript → tokenize the
    // hidden spans out + build the standing-lie inventory (the PURE projection).
    const bodies = await listSelectedAssistantBodies(ctx.db, game.chatId);
    return buildRevealView(bodies);
  }
  return { revealHidden };
}
