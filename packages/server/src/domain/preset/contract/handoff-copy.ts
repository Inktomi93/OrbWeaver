// domain/preset/contract/handoff-copy — the `PresetHandoffCopyContext` DI bundle + op type for the
// preset-OWNED generation-config copy the host-handoff property offer executes (stickler 2026-08-03 §5.7).
//
// WHY IT EXISTS. `rpg_games.gmPresetId` names the GM VOICE, and it is resolved under the ROOM HOST's
// ownership (`resolvePresetOverride` → `preset.get`). The moment authority moves, a preset the new host does
// not own resolves to a throw the lenient-id rule swallows: the game's voice changes silently while
// `getConfigView` keeps serving an id they can never inspect. The built handoff HEALS that by nulling the
// knob; an accepted offer instead GIVES them the voice, and this is the only op that copies an owned row
// across owners.
//
// BOTH ENDS ARE EXPLICIT AND BOTH ARE PROVEN (the injected-op caller-gate class): `fromOwnerId` is the
// ownership axis in the source read's WHERE, so a preset that is not the departing host's cannot be gifted by
// naming its id, and `toUserId` is the nominee — never re-derived here.
//
// IDEMPOTENT VIA LINEAGE, NOT A SECOND KEY: the copy stamps `forkedFrom = <source>`, and a retried — or
// CONCURRENT (#1572) — accept converges on the existing fork instead of minting a second. That is the same
// lineage column the copy-on-write update path already converges on, and the claim rides the INSERT's own
// guard rather than a preceding read, so there is no window between "no fork yet" and the write.

import type { Db } from "@orb/db";
import type { PresetId, UserId } from "@orb/kit/ids";

/** db + clock + the id minter. Purpose-built (NOT the full `PresetContext`): the copy writes one row, emits
 *  no `presetsChanged` and audits nothing — the chat verb owns the transfer's audit row. */
export interface PresetHandoffCopyContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPresetId: () => PresetId;
}

/** Copy one preset from `fromOwnerId`'s library into `toUserId`'s, verbatim. Returns the copy's id, or `null`
 *  when the source does not resolve under `fromOwnerId` (foreign, deleted, or the shared system default —
 *  which needs no copy because the recipient can already read it). A `null` tells the caller to fall back to
 *  the built conditional heal rather than to fail the accept. */
export type CopyPresetToUser = (args: { readonly fromOwnerId: UserId; readonly toUserId: UserId; readonly presetId: PresetId }) => Promise<PresetId | null>;
