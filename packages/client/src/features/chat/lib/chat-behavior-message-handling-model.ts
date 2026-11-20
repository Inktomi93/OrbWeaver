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
// `tempChatTtlHours` is not literally "message handling", but the chat-behavior pane's other section is
// Streaming (reveal pacing), and a chat's retention is a chat BEHAVIOR the same way auto-continue is; it lands
// beside them rather than forking a third section.

import type { ChatSettings } from "@orb/contracts/settings";
import type { ConfigSubcategory } from "#state";
import { MESSAGE_HANDLING_CONFIG_SUB, RUN_CARD_SCRIPTS_CONFIG_SETTING } from "#state";

export const CHAT_MESSAGE_HANDLING_SUBCATEGORY: ConfigSubcategory = {
  id: MESSAGE_HANDLING_CONFIG_SUB,
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
      id: "empty-enter-replies",
      key: "emptyEnterReplies",
      label: "Empty Enter asks for a reply",
      keywords: ["enter", "send", "generate", "continue", "extend", "empty", "prompt"],
      teach: {
        summary:
          "With an empty composer, Enter extends the last reply when the model spoke last, and prompts a new reply otherwise (a fresh chat, or your own message last). Off makes an empty Enter do nothing. The ▷ generate button works either way.",
        affects: ["what an empty-composer Enter or Send does"],
      },
    },
    {
      id: "auto-continue-rounds",
      key: "autoContinueRounds",
      label: "Auto-continue rounds",
      keywords: ["auto-continue", "continue", "rounds", "limit", "follow-up", "length", "cap"],
      teach: {
        summary:
          "When a reply stops at the length cap, fires up to this many follow-up continues automatically. 0 turns auto-continue off. A model that always hits the cap wants a bigger reply limit, not more rounds.",
        affects: ["every reply that stops at the length cap"],
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
        summary:
          "One per line. Generation stops as soon as the model emits any of these strings. They apply with every preset, on top of the active preset's own stop list.",
        affects: ["every generation, on every connection and preset"],
      },
    },
    {
      id: "temp-chat-ttl",
      key: "tempChatTtlHours",
      label: "Delete temp chats after (hours)",
      keywords: ["temporary", "temp", "ttl", "expire", "delete", "retention"],
      teach: {
        summary:
          "A temporary chat is deleted this many hours after it was created. Messages and all, whether or not you were still using it. Expired rooms are swept when you open Home.",
        affects: ["temporary chats only: ordinary chats are never swept"],
      },
    },
    {
      id: "offer-choices",
      key: "offerChoices",
      label: "Offer choices by default",
      keywords: ["choices", "options", "cyoa", "branching", "interactive"],
      teach: {
        summary:
          "Chats you host ask the model to end replies with a few numbered options; clicking one puts it in your composer to edit before you send. A chat whose own This chat tab sets it keeps that; every other chat you host, old or new, follows this.",
        affects: ["every chat you host that has not set its own"],
      },
    },
    {
      id: "reactions",
      key: "reactionsEnabled",
      label: "Reactions by default",
      keywords: ["reactions", "emoji"],
      teach: {
        summary:
          "Chats you host let members react to messages with emoji. A chat whose own This chat tab sets it keeps that; every other chat you host, old or new, follows this.",
        affects: ["every chat you host that has not set its own"],
      },
    },
    {
      id: "character-reactions",
      key: "charactersCanReact",
      label: "Characters can react by default",
      keywords: ["reactions", "emoji", "character"],
      teach: {
        summary:
          "Chats you host let the model drop an emoji reaction from a present character while it replies. Off by default: turning it on is the opt-in. A chat whose own This chat tab sets it keeps that; every other chat you host, old or new, follows this.",
        affects: ["every chat you host that has not set its own"],
      },
    },
    {
      id: RUN_CARD_SCRIPTS_CONFIG_SETTING,
      key: "runCardScripts",
      label: "Run scripts in cards and styled replies",
      keywords: ["interactive", "card", "script", "reply", "privacy", "ip"],
      teach: {
        summary:
          "Interactive cards and styled replies can run their own scripts in your browser, sandboxed away from your account. A script can still reveal your IP address to whoever wrote it. Off shows every card and styled reply without its scripts, in every chat, including rooms other people host. If your settings cannot be read, scripts stay off.",
        affects: ["every interactive card and styled reply you view, on this account"],
      },
    },
  ],
};

/** The `chat` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE spelling,
 *  three consumers: the {@link ChatMessageHandlingPatch} type, the seeded defaults/serverValues projection,
 *  and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true by
 *  construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  `autoSwipe` is claimed at the TOP-level key (§2.3): every one of its leaves has a control here. */
export const CHAT_MESSAGE_HANDLING_KEYS = [
  "enterSends",
  "emptyEnterReplies",
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
  // The viewer's consent to run card scripts in their own browser, honored at the card-frame mint. A chat
  // behavior for the `offerChoices` reason above; this pane is where a chat's per-user knobs live.
  "runCardScripts",
] as const;

export const AUTO_SWIPE_MIN_LENGTH_MIN = 0;

/** The flat form shape — one field per bound control; the two `string[]`s are newline-joined text. */
export interface ChatMessageHandlingForm {
  readonly enterSends: boolean;
  readonly emptyEnterReplies: boolean;
  readonly autoContinueRounds: number;
  readonly autoSwipeEnabled: boolean;
  readonly autoSwipeMinLength: number;
  readonly autoSwipeBlacklist: string;
  readonly customStoppingStrings: string;
  readonly tempChatTtlHours: number;
  readonly offerChoices: boolean;
  readonly reactionsEnabled: boolean;
  readonly charactersCanReact: boolean;
  readonly runCardScripts: boolean;
}

/** The section's WRITE shape, DERIVED from the `OWNS` tuple: exactly the owned keys. Kept a local ALIAS (not
 *  exported): §7.4 reserves exported type aliases for the type homes. */
type ChatMessageHandlingPatch = Pick<ChatSettings, (typeof CHAT_MESSAGE_HANDLING_KEYS)[number]>;

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
    emptyEnterReplies: chat.emptyEnterReplies,
    autoContinueRounds: chat.autoContinueRounds,
    autoSwipeEnabled: chat.autoSwipe.enabled,
    autoSwipeMinLength: chat.autoSwipe.minLength,
    autoSwipeBlacklist: chat.autoSwipe.blacklist.join("\n"),
    customStoppingStrings: chat.customStoppingStrings.join("\n"),
    tempChatTtlHours: chat.tempChatTtlHours,
    offerChoices: chat.offerChoices,
    reactionsEnabled: chat.reactionsEnabled,
    charactersCanReact: chat.charactersCanReact,
    runCardScripts: chat.runCardScripts,
  };
}

export function toMessageHandlingPatch(form: ChatMessageHandlingForm): ChatMessageHandlingPatch {
  return {
    enterSends: form.enterSends,
    emptyEnterReplies: form.emptyEnterReplies,
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
    runCardScripts: form.runCardScripts,
  };
}
