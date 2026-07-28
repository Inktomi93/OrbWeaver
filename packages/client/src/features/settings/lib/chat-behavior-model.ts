// The Chat-behavior pane's FORM projection of `UserSettings.chat`. The stored section nests `autoSwipe`
// and carries two free `string[]` list fields (autoSwipe.blacklist + customStoppingStrings); the bound
// field fleet has no free string-array editor, so the form flattens the nest and edits both lists as
// newline-delimited text (the system-pane's projectSystemForm precedent). `projectChatForm` maps the
// stored blob → the flat form value; `toChatSectionPatch` maps it back to the section-patch shape the
// `updateUserSettingsSection("chat")` write deep-merges.

import type { ChatSettings } from "@orb/contracts/settings";
import { STREAM_SCROLL_MODES } from "@orb/contracts/settings";
import type { SelectItems } from "@orb/ui/select";

export const AUTO_SWIPE_MIN_LENGTH_MIN = 0;
export const SMOOTH_STREAM_CPS_MIN = 15;
export const SMOOTH_STREAM_CPS_MAX = 300;

const STREAM_SCROLL_MODE_LABELS: Record<ChatSettings["streamScrollMode"], string> = {
  follow: "Follow the reply",
  "pin-prompt": "Pin my message to the top",
};
/** The scroll-mode Select options — pinned to the contract union so a typo'd value is a tsc error. */
export const STREAM_SCROLL_MODE_ITEMS: SelectItems<string> = STREAM_SCROLL_MODES.map((value) => ({
  value,
  label: STREAM_SCROLL_MODE_LABELS[value],
}));

/** The flat form shape — one field per bound control; the two `string[]`s are newline-joined text. */
export interface ChatBehaviorForm {
  readonly enterSends: boolean;
  readonly continueOnSend: boolean;
  readonly generateOnEmptySend: boolean;
  readonly autoContinue: boolean;
  readonly autoSwipeEnabled: boolean;
  readonly autoSwipeMinLength: number;
  readonly autoSwipeBlacklist: string;
  readonly customStoppingStrings: string;
  readonly smoothStream: boolean;
  readonly smoothStreamCps: number;
  readonly streamScrollMode: ChatSettings["streamScrollMode"];
}

/** One phrase per line — split, trim, drop blanks (the stored list never carries empty entries). */
function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function projectChatForm(chat: ChatSettings): ChatBehaviorForm {
  return {
    enterSends: chat.enterSends,
    continueOnSend: chat.continueOnSend,
    generateOnEmptySend: chat.generateOnEmptySend,
    autoContinue: chat.autoContinue,
    autoSwipeEnabled: chat.autoSwipe.enabled,
    autoSwipeMinLength: chat.autoSwipe.minLength,
    autoSwipeBlacklist: chat.autoSwipe.blacklist.join("\n"),
    customStoppingStrings: chat.customStoppingStrings.join("\n"),
    smoothStream: chat.smoothStream,
    smoothStreamCps: chat.smoothStreamCps,
    streamScrollMode: chat.streamScrollMode,
  };
}

/** The pane-edited slice of the `chat` section (the section-patch DEEP-MERGES, so the PD-146 knobs this pane
 *  does NOT edit — `autoSwipe.maxRetries`, `autoContinueRounds`, `tempChatTtlHours` — survive untouched: the
 *  nested `autoSwipe` merge preserves the stored `maxRetries`, and the omitted top-level knobs are preserved).
 *  A partial-deep of `ChatSettings` so those unedited fields are not required here. */
type ChatBehaviorPatch = Omit<ChatSettings, "autoSwipe" | "autoContinueRounds" | "tempChatTtlHours"> & {
  readonly autoSwipe: Omit<ChatSettings["autoSwipe"], "maxRetries">;
};

export function toChatSectionPatch(form: ChatBehaviorForm): ChatBehaviorPatch {
  return {
    enterSends: form.enterSends,
    continueOnSend: form.continueOnSend,
    generateOnEmptySend: form.generateOnEmptySend,
    autoContinue: form.autoContinue,
    autoSwipe: {
      enabled: form.autoSwipeEnabled,
      minLength: form.autoSwipeMinLength,
      blacklist: linesToList(form.autoSwipeBlacklist),
    },
    customStoppingStrings: linesToList(form.customStoppingStrings),
    smoothStream: form.smoothStream,
    smoothStreamCps: form.smoothStreamCps,
    streamScrollMode: form.streamScrollMode,
  };
}
