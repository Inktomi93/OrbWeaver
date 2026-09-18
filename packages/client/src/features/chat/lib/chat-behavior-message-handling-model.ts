// The "Chat & message handling" chat-behavior SECTION MODEL (SET-SEAMS §6, stage 2) — the section's non-JSX
// facts: the ONE `ConfigSubcategory` shared by the contribution def and the section body's `<Section>`
// anchor stamp (split out so neither imports the other), the `OWNS` key tuple, and the form↔patch
// projection. The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1).
//
// The stored `chat` section nests `autoSwipe` and carries two free `string[]` list fields
// (autoSwipe.blacklist + customStoppingStrings); the bound field fleet has no free string-array editor, so
// the form FLATTENS the nest and edits both lists as newline-delimited text. That is why this section
// projects by hand instead of `pickKeys` (the appearance sections' shape): the form value is not a subset of
// `ChatSettings`. Minimality is still tsc-forced — {@link ChatMessageHandlingPatch} is DERIVED from the
// `OWNS` tuple, so a patch field this section does not own does not typecheck.
//
// `autoContinueRounds` and `tempChatTtlHours` joined the tuple after stage 2 (they were the two cited
// gap-arm exemptions): both are SERVER-honored — the turn engine's AUTO_CONTINUE loop bound and the
// `reapTemporaryChats` delete cutoff — and neither had ever had an editor. `tempChatTtlHours` is not
// literally "message handling", but the chat-behavior pane's other section is Streaming (reveal pacing),
// and a chat's retention is a chat BEHAVIOR the same way auto-continue is; it lands beside them rather
// than forking a third section.

import type { ChatSettings } from "@orb/contracts/settings";
import type { ConfigSubcategory } from "#state";

export const CHAT_MESSAGE_HANDLING_SUBCATEGORY: ConfigSubcategory = {
  id: "message-handling",
  label: "Chat & message handling",
  // The full name overflows the 220px nav column; the heading keeps it. Inside the Chat behavior pane the
  // "Chat &" half is the pane's own context anyway, so the nav row is unambiguous without it.
  navLabel: "Message handling",
  keywords: ["send", "continue", "keyboard", "temporary"],
  teach: {
    summary:
      "Composer keyboard grammar (Enter to send), empty-send behavior, auto-continue rounds, swipe navigation, stopping strings and temporary chat retention.",
    affects: ["the composer and message lifecycle in every chat, on this account"],
  },
  settings: [
    {
      id: "enter-sends",
      key: "enterSends",
      label: "Enter to send",
      keywords: ["enter", "keyboard", "newline", "shortcut"],
      teach: {
        summary: "Off makes Enter insert a newline; ⌘/Ctrl+Enter always sends, and Shift+Enter is always a newline.",
        affects: ["the composer's keyboard grammar, in every chat"],
      },
    },
    {
      id: "empty-enter-generates",
      key: "generateOnEmptySend",
      label: "Empty Enter generates a reply",
      keywords: ["enter", "generate", "empty", "prompt"],
      teach: {
        summary:
          "With an empty composer and no assistant message last (a fresh chat, or your own message last), Enter prompts a reply instead of doing nothing. The ▷ generate button does the same, always.",
        affects: ["what an empty-composer Enter does"],
      },
    },
    {
      id: "continue-on-send",
      key: "continueOnSend",
      label: "Send continues the reply",
      keywords: ["continue", "extend", "empty"],
      teach: {
        summary: "With an empty composer and an assistant message last, Send extends that reply instead of doing nothing.",
        affects: ["what an empty-composer Send does"],
      },
    },
    {
      id: "auto-continue",
      key: "autoContinue",
      label: "Auto-continue",
      keywords: ["continue", "length", "cap", "follow-up"],
      teach: {
        summary: "When a reply stops at the length cap, fires follow-up continues automatically — as many as the round limit. Syncs across your devices.",
        affects: ["every reply that stops at the length cap"],
        related: [{ group: "chat-behavior", sub: "message-handling", setting: "auto-continue-rounds" }],
      },
    },
    {
      id: "auto-continue-rounds",
      key: "autoContinueRounds",
      label: "Auto-continue rounds",
      keywords: ["continue", "rounds", "limit", "follow-up", "cap"],
      teach: {
        summary:
          "The most follow-up continues one send may fire while the reply keeps stopping at the length cap. A model that always hits the cap wants a bigger reply limit, not more rounds.",
        affects: ["how far one send may chain continues"],
      },
    },
    {
      id: "auto-swipe",
      key: "autoSwipe",
      label: "Auto-swipe short replies",
      keywords: ["swipe", "regenerate", "retry", "blacklist", "minimum", "phrases"],
      teach: {
        summary:
          "When a reply is too short or hits a blacklisted phrase, regenerates it once automatically. The minimum length and the phrase list live under this switch.",
        affects: ["every incoming reply, once per send"],
      },
    },
    {
      id: "custom-stopping-strings",
      key: "customStoppingStrings",
      label: "Custom stopping strings",
      keywords: ["stop", "stopping", "sequence", "generation"],
      teach: {
        summary: "One per line. Generation stops as soon as the model emits any of these strings.",
        affects: ["every generation, on every connection"],
      },
    },
    {
      id: "temp-chat-ttl",
      key: "tempChatTtlHours",
      label: "Delete temp chats after",
      keywords: ["temporary", "temp", "ttl", "expire", "delete", "retention"],
      teach: {
        summary:
          "A temporary chat is deleted this many hours after it was created — messages and all, whether or not you were still using it. Expired rooms are swept when you open Home.",
        affects: ["temporary chats only — ordinary chats are never swept"],
      },
    },
    {
      id: "offer-choices",
      key: "offerChoices",
      label: "Offer choices in new chats",
      keywords: ["choices", "options", "cyoa", "branching", "interactive"],
      teach: {
        summary:
          "New chats start out asking the model to end replies with a few numbered options; clicking one puts it in your composer to edit before you send.",
        affects: ["new chats' starting posture only"],
      },
    },
    {
      id: "reactions",
      key: "reactionsEnabled",
      label: "Reactions in new chats",
      keywords: ["reactions", "emoji"],
      teach: {
        summary: "New chats you host let members react to messages with emoji. Existing chats keep whatever they are set to — change one in its This chat tab.",
        affects: ["new chats you host"],
      },
    },
    {
      id: "character-reactions",
      key: "charactersCanReact",
      label: "Characters can react in new chats",
      keywords: ["reactions", "emoji", "character"],
      teach: {
        summary:
          "New chats you host let the model drop an emoji reaction from a present character while it replies. Off by default — turning it on is the opt-in.",
        affects: ["new chats you host"],
      },
    },
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
  "autoContinueRounds",
  "autoSwipe",
  "customStoppingStrings",
  "tempChatTtlHours",
  // B1 — the per-user DEFAULT offer-choices posture a room inherits when its own key is absent. Lands in
  // this section for the `tempChatTtlHours` reason spelled in the header: it is not literally "message
  // handling" either, but the pane's only other section is Streaming (reveal pacing), and a chat's default
  // storytelling posture is a chat BEHAVIOR the same way auto-continue is. Forking a third section for one
  // switch would cost a nav row and a save footer to say less.
  "offerChoices",
  // B7 — the two per-user reaction DEFAULTS a room inherits when its own key is absent (the offerChoices
  // twins, same section for the same reason). Opposite default directions BY DESIGN: `reactionsEnabled`
  // ships ON (B6 is live; the knob makes it disableable), `charactersCanReact` ships OFF (an autonomous AI
  // reacting is opt-in — owner requirement).
  "reactionsEnabled",
  "charactersCanReact",
] as const;

export const AUTO_SWIPE_MIN_LENGTH_MIN = 0;

// The editor bounds MIRROR the `chatSchema` clamps in `@orb/contracts/settings` (the schema's own
// MIN/MAX consts are module-private there) — the streaming section's `SMOOTH_STREAM_CPS_*` precedent. The
// server is still the authority: an out-of-range blob self-heals to the default via `.catch()`.
export const AUTO_CONTINUE_ROUNDS_MIN = 1;
export const AUTO_CONTINUE_ROUNDS_MAX = 5;
export const TEMP_CHAT_TTL_HOURS_MIN = 1;
export const TEMP_CHAT_TTL_HOURS_MAX = 8760;

/** The flat form shape — one field per bound control; the two `string[]`s are newline-joined text. */
export interface ChatMessageHandlingForm {
  readonly enterSends: boolean;
  readonly continueOnSend: boolean;
  readonly generateOnEmptySend: boolean;
  readonly autoContinue: boolean;
  readonly autoContinueRounds: number;
  readonly autoSwipeEnabled: boolean;
  readonly autoSwipeMinLength: number;
  readonly autoSwipeBlacklist: string;
  readonly customStoppingStrings: string;
  readonly tempChatTtlHours: number;
  readonly offerChoices: boolean;
  readonly reactionsEnabled: boolean;
  readonly charactersCanReact: boolean;
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
    autoContinueRounds: chat.autoContinueRounds,
    autoSwipeEnabled: chat.autoSwipe.enabled,
    autoSwipeMinLength: chat.autoSwipe.minLength,
    autoSwipeBlacklist: chat.autoSwipe.blacklist.join("\n"),
    customStoppingStrings: chat.customStoppingStrings.join("\n"),
    tempChatTtlHours: chat.tempChatTtlHours,
    offerChoices: chat.offerChoices,
    reactionsEnabled: chat.reactionsEnabled,
    charactersCanReact: chat.charactersCanReact,
  };
}

export function toMessageHandlingPatch(form: ChatMessageHandlingForm): ChatMessageHandlingPatch {
  return {
    enterSends: form.enterSends,
    continueOnSend: form.continueOnSend,
    generateOnEmptySend: form.generateOnEmptySend,
    autoContinue: form.autoContinue,
    autoContinueRounds: form.autoContinueRounds,
    autoSwipe: {
      enabled: form.autoSwipeEnabled,
      minLength: form.autoSwipeMinLength,
      blacklist: linesToList(form.autoSwipeBlacklist),
    },
    customStoppingStrings: linesToList(form.customStoppingStrings),
    tempChatTtlHours: form.tempChatTtlHours,
    offerChoices: form.offerChoices,
    reactionsEnabled: form.reactionsEnabled,
    charactersCanReact: form.charactersCanReact,
  };
}
