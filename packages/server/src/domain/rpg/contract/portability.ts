// domain/rpg/contract/portability — the TWO portability ops of the chat-anchored campaign (R6), in one
// contract file because they share one DI bundle and one shape. Standalone factories (db + clock + the id
// mints only), principal-less by design: the delivery core knows only `ownerId`, and the chat-bundle's
// export/import verbs already ran their own host/ownership gate on the CHAT before either op is reached
// (authority is INHERITED through the chat FK chain — D23: rpg stamps no owner anywhere). The databank
// portability-write is the precedent for the whole shape.
//
// WHY rpg NEEDS ITS OWN PAIR rather than riding the chat serde: a campaign is six tables the chat domain
// does not own, and three of them (`rpg_snapshots`, `rpg_journal`, `rpg_turn_tool_calls`) are keyed to
// MESSAGES and VARIANTS. Reaching into them from `domain/chat` would be a sideways write; reaching into
// chat from here would be the same crime the other way. So these are INJECTED OPS the `export`/`import`
// aggregators wire at the composition root (§1d tier 3) — the same seam `importLorebook`/`linkCarriedBooks`
// already use for the world-info planes a card carries.
//
// THESE OPS SPEAK RAW IDS, NEVER BUNDLE POSITIONS. The portable file's cross-plane references are positional
// (`messages[i].variants[j]`) because ids are not preserved across a box — but that is the SERDE's business.
// The export verb resolves ids → positions on the way out and positions → ids on the way in (through the
// `ImportedChatRemap` the chat write op returns), so rpg never learns what a bundle index is and
// the serde never learns what a `MessageVariantId` is.

import type { Db } from "@orb/db";
import type { Clock } from "@orb/kit/time";
import type { RpgIdMints } from "./service.ts";

/** The DI bundle both rpg portability ops close over. */
export interface RpgPortabilityContext {
  readonly db: Db;
  readonly now: Clock;
  readonly ids: RpgIdMints;
}
