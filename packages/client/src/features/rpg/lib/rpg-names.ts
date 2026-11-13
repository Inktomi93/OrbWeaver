// The words the game panels print and a spec locates them by. Zero runtime imports, so a spec or another
// feature reads them without the component graph.

import type { RpgToolCallVerdict } from "@orb/contracts/rpg";

/** The game tabs of the context panel, by tab. */
export const RPG_CONTEXT_TAB_LABELS = {
  status: "Status",
  inventory: "Inventory",
  scene: "Scene",
  quests: "Quests",
  journal: "Journal",
  map: "Map",
  game: "Game",
} as const;

/** The header band's badge when the model can't update trackers. */
export const RPG_READ_ONLY_LABEL = "Read-only";

/** The Game tab's door to the Status sheet's scores. */
export const RPG_SET_SCORES_NAME = "Set character scores";

/** The attribute setup's two generators. */
export const RPG_ROLL_SCORES_NAME = "Roll 4d6 drop lowest";
export const RPG_STANDARD_ARRAY_NAME = "Use standard array";

/** The Game tab's disclosure over the host's less common settings. */
export const RPG_HOST_ADVANCED_LABEL = "Advanced";

/** The game macros' browser disclosure. */
export const RPG_MACRO_BROWSER_LABEL = "Macro browser";

/** The dice composer's ability-check submenu, and the hint on an attribute with no score yet. */
export const RPG_ABILITY_CHECK_NAME = "Ability check";
export const RPG_SCORE_UNSET_HINT = "Set your score in Status first.";

/** An actor card's status line: its field label and its empty placeholder. */
export const RPG_STATUS_LINE_LABEL = "Status line";
export const RPG_STATUS_PLACEHOLDER = "Add status";

/** An actor card's add-condition placeholder. */
export const RPG_CONDITION_PLACEHOLDER = "+ condition";

/** The Journal tab's scope toggles. Cards is also the Scene tab's archive heading. */
export const RPG_JOURNAL_SCOPE_LABELS = { all: "All", marks: "Marks", cards: "Cards" } as const;

/** The Journal composer's add action. */
export const RPG_JOURNAL_ADD_ENTRY_NAME = "Add entry";

/** The lead of the empty chronicle's line; the rest says who writes the first page. */
export const RPG_JOURNAL_EMPTY_LEAD = "Nothing chronicled yet:";

/** The empty card archive, in the Journal Cards scope and in the Scene tab. */
export const RPG_JOURNAL_NO_CARDS_LINE = "No cards yet: the story crafts them.";
export const RPG_SCENE_NO_CARDS_LINE = "No cards yet: the story crafts them, and they land here.";

/** An archived card row's name; `note` is the provenance a lenient wrap adds, or null. */
export function openCardName(label: string, stamp: string, note: string | null): string {
  return `Open card: ${label}, ${stamp}${note === null ? "" : `, ${note}`}`;
}

/** The known-characters disclosure, by open state. */
export const RPG_SHOW_KNOWN_CHARACTERS_NAME = "Show known characters";
export const RPG_HIDE_KNOWN_CHARACTERS_NAME = "Hide known characters";

/** A known character's doorways and their confirms, each named by whose they are. */
export function npcPromoteName(name: string): string {
  return `Promote ${name} to the room's characters`;
}
export function npcDismissName(name: string): string {
  return `Dismiss ${name}`;
}
export function npcCancelPromoteName(name: string): string {
  return `Cancel promoting ${name}`;
}
export function npcConfirmPromoteName(name: string): string {
  return `Confirm promoting ${name}`;
}
export function npcConfirmDismissName(name: string): string {
  return `Confirm dismissing ${name}`;
}

/** The promote doorway's tip, which also opens its confirm question. */
export function npcPromoteTipLabel(name: string): string {
  return `Give ${name} a character card and a seat in this room`;
}
export function npcPromoteQuestionLabel(name: string): string {
  return `${npcPromoteTipLabel(name)}? Everything tracked on them comes along; their mood and their stance toward you do not.`;
}
export function npcDismissQuestionLabel(name: string): string {
  return `Forget ${name} and everything tracked on them?`;
}

/** An npc card's mood value at rest; `mood` is the label shown, or the no-value word. */
export function npcMoodName(name: string, mood: string): string {
  return `${name} mood: ${mood}`;
}

/** One revealed field of a hidden span in the veiled log: the span attribute's key, then its value. */
export function veiledFieldLine(key: string, value: string): string {
  return `${key}: ${value}`;
}

/** A veiled lie's revealed motive and truth lines. */
export function veiledReasonLabel(reason: string): string {
  return `reason: ${reason}`;
}
export function veiledTruthLabel(truth: string): string {
  return `truth: ${truth}`;
}

/** A turn's game-actions disclosure: what it opens, then its summary. */
export function turnToolCallsName(summary: string): string {
  return `Game actions on this turn: ${summary}`;
}

/** The disclosure summary of a turn whose state round ran: how many actions, and whether any came back short. */
export function turnToolCallsCount(count: number, incomplete: boolean): string {
  return `${String(count)}${incomplete ? ", needs attention" : ""}`;
}

/** A recorded game action's verdict, said as an OUTCOME in the reader's terms, not the enum: "dropped" alone
 *  reads like a UI state; "not recorded" is what actually happened to their game. */
export const RPG_TOOL_CALL_VERDICT_LABELS: Record<RpgToolCallVerdict, string> = {
  applied: "recorded",
  salvaged: "partly recorded",
  dropped: "not recorded",
  // Says whose decision it was, not what the merge did: the host pinned this field, so the honest sentence
  // is that their edit held — the `issues` line under the badge names the path it held.
  overridden: "your edit kept",
};

/** A Game tab tracker row's controls, one name per state, so a spec names the state it expects. */
export function trackerLabelFieldName(index: number): string {
  return `Tracker ${index + 1} label`;
}
export function trackerShowOnBandName(label: string): string {
  return `Show ${label} as a band orb`;
}
export function trackerRemoveFromBandName(label: string): string {
  return `Remove ${label} from the band`;
}
export function trackerLockName(label: string): string {
  return `Lock ${label}: the story can no longer write it`;
}
export function trackerUnlockName(label: string): string {
  return `Let the story write ${label} again`;
}

/** A tracker row's remove button, its meter ceiling field and its hint field, named for the tracker. */
export function trackerRemoveName(label: string): string {
  return `Remove ${label}`;
}
export function trackerDefaultMaxName(label: string): string {
  return `${label} default max`;
}
export function trackerHintName(label: string): string {
  return `${label} hint`;
}

/** The tracker add row's name field. */
export const RPG_NEW_TRACKER_NAME = "New tracker name";
