// The "Chat & message handling" chat-behavior SECTION MODEL (SET-SEAMS §6, stage 2) — the section's non-JSX
// facts: the ONE `SettingsSubcategory` shared by the contribution def and the section body's `<Section>`
// anchor stamp (split out so neither imports the other), the `OWNS` key tuple, and the form↔patch
// projection. The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1).
//
// The stored `chat` section nests `autoSwipe` and carries two free `string[]` list fields
// (autoSwipe.blacklist + customStoppingStrings); the bound field fleet has no free string-array editor, so
// the form FLATTENS the nest and edits both lists as newline-delimited text. That is why this section
// projects by hand instead of `pickKeys` (the appearance sections' shape): the form value is not a subset of
// `ChatSettings`. Minimality is still tsc-forced — {@link ChatMessageHandlingPatch} is DERIVED from the
// `OWNS` tuple, so a patch field this section does not own does not typecheck.

import type { ChatSettings } from "@orb/contracts/settings";
import type { SettingsSubcategory } from "#state";

export const CHAT_MESSAGE_HANDLING_SUBCATEGORY: SettingsSubcategory = {
  id: "message-handling",
  label: "Chat & message handling",
  keywords: ["send", "continue", "keyboard"],
  settings: [
    { id: "enter-sends", label: "Enter to send", keywords: ["enter", "keyboard", "newline", "shortcut"] },
    { id: "continue-on-send", label: "Send continues the reply", keywords: ["continue", "extend", "empty"] },
    { id: "auto-continue", label: "Auto-continue", keywords: ["continue", "length", "cap", "follow-up"] },
    { id: "auto-swipe", label: "Auto-swipe short replies", keywords: ["swipe", "regenerate", "retry", "blacklist"] },
    { id: "custom-stopping-strings", label: "Custom stopping strings", keywords: ["stop", "stopping", "sequence", "generation"] },
  ],
};

/** The `chat` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE spelling,
 *  three consumers: the {@link ChatMessageHandlingPatch} type, the seeded defaults/serverValues projection,
 *  and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true by
 *  construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  `autoSwipe` is claimed at the TOP-level key (§2.3): its leaves are this section's business, and the
 *  server's `deepMergePlain` preserves the one leaf with no editor (`maxRetries`). */
export const CHAT_MESSAGE_HANDLING_KEYS = [
  "enterSends",
  "continueOnSend",
  "generateOnEmptySend",
  "autoContinue",
  "autoSwipe",
  "customStoppingStrings",
] as const;

export const AUTO_SWIPE_MIN_LENGTH_MIN = 0;

/** The flat form shape — one field per bound control; the two `string[]`s are newline-joined text. */
export interface ChatMessageHandlingForm {
  readonly enterSends: boolean;
  readonly continueOnSend: boolean;
  readonly generateOnEmptySend: boolean;
  readonly autoContinue: boolean;
  readonly autoSwipeEnabled: boolean;
  readonly autoSwipeMinLength: number;
  readonly autoSwipeBlacklist: string;
  readonly customStoppingStrings: string;
}

/** The section's WRITE shape, DERIVED from the `OWNS` tuple: exactly the owned keys, with `autoSwipe`
 *  narrowed to the leaves the form edits (`maxRetries` has no editor and the deep-merge preserves it). Kept
 *  a local ALIAS (not exported, not an interface): `no-inline-types` reserves exported type aliases for the
 *  type homes, and an interface would lose the implicit index signature the tRPC input's
 *  `Record<string, unknown>` needs. Consumers derive it as `ReturnType<typeof toMessageHandlingPatch>`. */
type ChatMessageHandlingPatch = Omit<Pick<ChatSettings, (typeof CHAT_MESSAGE_HANDLING_KEYS)[number]>, "autoSwipe"> & {
  readonly autoSwipe: Omit<ChatSettings["autoSwipe"], "maxRetries">;
};

/** One phrase per line — split, trim, drop blanks (the stored list never carries empty entries). */
function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function projectMessageHandlingForm(chat: ChatSettings): ChatMessageHandlingForm {
  return {
    enterSends: chat.enterSends,
    continueOnSend: chat.continueOnSend,
    generateOnEmptySend: chat.generateOnEmptySend,
    autoContinue: chat.autoContinue,
    autoSwipeEnabled: chat.autoSwipe.enabled,
    autoSwipeMinLength: chat.autoSwipe.minLength,
    autoSwipeBlacklist: chat.autoSwipe.blacklist.join("\n"),
    customStoppingStrings: chat.customStoppingStrings.join("\n"),
  };
}

export function toMessageHandlingPatch(form: ChatMessageHandlingForm): ChatMessageHandlingPatch {
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
  };
}
