// The roster library's leaf vocabulary — the collection KIND, and nothing else.
//
// ITS OWN MODULE FOR THE REASON THE OTHER THREE COLLECTIONS HAVE ONE (`tags-model` · `regex-model` ·
// `world-info-model`): the kind is read by the contribution, by the config GROUP that carries the library's
// identity, and by the hooks that write a member SELECTION — and the hooks are imported BY the contribution,
// so homing the id there is an import cycle (caught by depcruise `no-circular`, 2026-09-02). A leaf module
// has no imports of its own and therefore cannot be in one — a TYPE-ONLY import from `contracts` is not a
// counterexample: it is erased at build and points DOWN the package cake, so it can be in no cycle.

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import { characterCountPhrase } from "./roster-copy.ts";

/** The collection KIND — the `rosterPreset` config group id (registry key + the selection store's kind axis). */
export const ROSTER_COLLECTION_ID = "rosterPreset";

/** A saved roster's SCENT — the one string a library row is scanned by: its census, then the names that
 *  census counts (`3 characters · 2 rules · Elara, Kael, Roan`).
 *
 *  IT IS THE SUBTITLE, AND THAT IS THE #1838 FIX. The census used to ride `markers` — `LibraryRow`'s
 *  TITLE-LINE trailing slot — which docks at the row's right edge. That was invisible in the 307px LIST
 *  column and became a defect the moment #1725 moved these rows into a 990px CONTENT pane: the name's ink
 *  ends near x=30 and its own count starts near the pane's edge, the same ink-to-ink hole measured at
 *  84–86% on the tag rows (side-eye 2026-09-06, #1824's twin). `markers` is for rest-visible STATUS
 *  (Active / Global / a built-in lock) — a badge that earns the title line. A census is not a status: it
 *  is the quantity the NAME is counted by, and a figure parked several hundred px from that name stops
 *  reading as its count. the mock design §3.3 draws the roster subtitle as exactly this — "rosters: members ·
 *  rules".
 *
 *  THE NAME GLOSS SURVIVES, AS THE TAIL. It was the whole subtitle before, and it is what the file's own
 *  header calls the row's scan value; folding it behind the census costs no title-line width, keeps the
 *  quantities first where a truncating subtitle can still show them, and keeps the spoken description one
 *  sentence instead of two slots (both `markers` and `subtitle` ride the row's `aria-describedby`).
 *
 *  Zero rules contributes NOTHING rather than "0 rules": the absence is the common case and a zero would
 *  be a fact the reader has to discard on every row. Zero members cannot happen through the UI, but it is
 *  spelled honestly rather than guarded away. */
export function rosterScent(roster: RosterPresetSummary): string {
  const parts = [characterCountPhrase(roster.characterCount)];
  if (roster.rules.length > 0) {
    parts.push(`${String(roster.rules.length)} rule${roster.rules.length === 1 ? "" : "s"}`);
  }
  const names = roster.members.map((member) => member.name).join(", ");
  if (names !== "") {
    parts.push(names);
  }
  return parts.join(" · ");
}
