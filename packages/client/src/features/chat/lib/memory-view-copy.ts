// The Memory tab's words: what the story remembers, in a player's terms. Tier, block and bucket stay in the
// recall detail; nothing here names them.

export const MEMORY_STRIKE_LABEL = "Strike";
export const MEMORY_RESTORE_LABEL = "Restore";
export const MEMORY_TURN_ON_LABEL = "Turn on";
export const MEMORY_UNTITLED_SCENE = "Untitled scene";
export const MEMORY_UNMATCHED_UNTITLED = "A struck scene";
export const MEMORY_LEFT_SPEAKER = "a character who left";
export const MEMORY_VIEW_LOAD_SUBJECT = "the story's memory";
export const MEMORY_OPEN_VIEW_LABEL = "See what the story remembers";
export const MEMORY_RECALL_DETAIL_HEADING = "Recall detail";
export const MEMORY_UNMATCHED_HEADING = "Struck scenes no longer in the story";
export const MEMORY_UNMATCHED_NOTE = "The messages these covered were hidden, deleted or moved. They leave nothing out until the scene returns.";
export const MEMORY_EVERYONE_REMEMBERS = "Everyone remembers this";
export const MEMORY_STRUCK_NOTE = "Struck: left out of every reply";
export const MEMORY_CHANGED_SINCE_STRIKE_NOTE = "Summarized again since it was struck; it stays out";
export const MEMORY_RETELLS_STRUCK_NOTE = "Left out because it retells a struck scene";
export const MEMORY_RECENT_WINDOW_NOTE = "The latest messages are read word for word and are not listed here.";
export const MEMORY_REFUSED_NOT_HOST = "Only the host can strike or restore memories.";
export const MEMORY_REFUSED_STALE = "This memory changed since you opened it. The list is refreshed; strike it again if it is still wrong.";
export const MEMORY_REFUSED_OTHER = "That did not go through. Try again.";

/** What an empty view says, by why it is empty. The host reads its own switch in the second person. */
export const MEMORY_STATUS_COPY = {
  appOff: { title: "Memory is off for this app", description: "Replies recall nothing until memory is turned on in the app's settings." },
  hostOff: { title: "The host has memory turned off", description: "Replies recall nothing while it is off." },
  hostOffForHost: { title: "You have memory turned off", description: "Replies recall nothing while it is off." },
  tooShort: { title: "Nothing to remember yet", description: "The chat is short enough that every reply reads it word for word." },
  pending: { title: "No summaries yet", description: "The first summaries are written in the background after replies." },
  beforeYourHistory: { title: "Nothing from your part of the story yet", description: "Everything remembered so far happened before you joined." },
} as const;

export function memoryScopedRemembersLabel(name: string): string {
  return `Only ${name} remembers this`;
}

export function memorySpeakersLabel(names: readonly string[]): string {
  return `With ${names.join(", ")}`;
}

/** A strike or restore control's accessible name: the verb and the scene it acts on. */
export function memoryStrikeName(scene: string): string {
  return `${MEMORY_STRIKE_LABEL} ${scene}`;
}

export function memoryRestoreName(scene: string): string {
  return `${MEMORY_RESTORE_LABEL} ${scene}`;
}
