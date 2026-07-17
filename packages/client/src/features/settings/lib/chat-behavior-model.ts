// The Chat-behavior pane's FORM projection of `UserSettings.chat`. The stored section nests `autoSwipe`
// and carries two free `string[]` list fields (autoSwipe.blacklist + customStoppingStrings); the bound
// field fleet has no free string-array editor, so the form flattens the nest and edits both lists as
// newline-delimited text (the system-pane's projectSystemForm precedent). `projectChatForm` maps the
// stored blob → the flat form value; `toChatSectionPatch` maps it back to the section-patch shape the
// `updateUserSettingsSection("chat")` write deep-merges.

import type { ChatSettings } from "@orb/contracts/settings";

export const AUTO_SWIPE_MIN_LENGTH_MIN = 0;
export const SMOOTH_STREAM_CPS_MIN = 15;
export const SMOOTH_STREAM_CPS_MAX = 300;

/** The flat form shape — one field per bound control; the two `string[]`s are newline-joined text. */
export interface ChatBehaviorForm {
  readonly enterSends: boolean;
  readonly continueOnSend: boolean;
  readonly autoContinue: boolean;
  readonly autoSwipeEnabled: boolean;
  readonly autoSwipeMinLength: number;
  readonly autoSwipeBlacklist: string;
  readonly customStoppingStrings: string;
  readonly smoothStream: boolean;
  readonly smoothStreamCps: number;
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
    autoContinue: chat.autoContinue,
    autoSwipeEnabled: chat.autoSwipe.enabled,
    autoSwipeMinLength: chat.autoSwipe.minLength,
    autoSwipeBlacklist: chat.autoSwipe.blacklist.join("\n"),
    customStoppingStrings: chat.customStoppingStrings.join("\n"),
    smoothStream: chat.smoothStream,
    smoothStreamCps: chat.smoothStreamCps,
  };
}

/** The full `chat` section shape (deep-merged by the section-patch write). */
export function toChatSectionPatch(form: ChatBehaviorForm): ChatSettings {
  return {
    enterSends: form.enterSends,
    continueOnSend: form.continueOnSend,
    autoContinue: form.autoContinue,
    autoSwipe: {
      enabled: form.autoSwipeEnabled,
      minLength: form.autoSwipeMinLength,
      blacklist: linesToList(form.autoSwipeBlacklist),
    },
    customStoppingStrings: linesToList(form.customStoppingStrings),
    smoothStream: form.smoothStream,
    smoothStreamCps: form.smoothStreamCps,
  };
}
