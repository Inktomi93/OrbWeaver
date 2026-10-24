// The Personas group's nav entries — the ONE `ConfigSubcategory` per registered section, shared by the
// contribution def and the section body's anchor stamp, so a LIST row can never address an anchor no section
// renders. Two sections: the list and the notifications switch.
//
// The list's leaves are search LEAVES of the section that contains them (fork F-14): the editor (a row's own
// inline expansion) and the persona CONCEPTS — the crown, the start order, the pin, connections, placement,
// restamp, the SillyTavern map. A concept leaf has no row of its own; a search landing scrolls to the list and
// the teacher shows its lesson, so search finds "{{user}}", "pin" or "sillytavern" here.

import type { ConfigSettingRef, ConfigSubcategory } from "#state";
import { openConfigTo } from "#state";
import {
  renderConnectionsLearn,
  renderCrownLearn,
  renderMarksLearn,
  renderPinLearn,
  renderPlacementLearn,
  renderRestampLearn,
  renderSillyTavernLearn,
  renderStartOrderLearn,
} from "../components/persona-learn.tsx";

const LIST_ID = "your-personas";

function leaf(setting: string): ConfigSettingRef {
  return { group: "personas", sub: LIST_ID, setting };
}

export const PERSONA_NOTIFICATIONS_SUBCATEGORY: ConfigSubcategory = {
  id: "notifications",
  label: "Notifications",
  teach: {
    summary:
      "Whether the app confirms persona changes with a notice when you switch who you play as or a restamp lands, and when a new chat starts you as someone other than your default.",
    affects: ["notices about persona changes, on this account everywhere"],
  },
  settings: [
    {
      id: "persona-notifications",
      label: "Notify me when my persona changes in a chat",
      key: "showNotifications",
      keywords: ["notify", "notification", "alert"],
      teach: {
        summary:
          "A short notice when your persona changes in a chat: you switch who you're playing, a restamp lands, the crown or the pin moves, or a new chat starts you as someone other than your default.",
        affects: ["notices about persona changes, on this account everywhere"],
      },
    },
  ],
};

export const PERSONA_LIST_SUBCATEGORY: ConfigSubcategory = {
  id: LIST_ID,
  label: "Your personas",
  keywords: [
    "persona",
    "new persona",
    "import",
    "restore",
    "default",
    "crown",
    "pin",
    "{{user}}",
    "avatar",
    "sillytavern",
    "backup",
    "default persona",
    "favorite",
  ],
  teach: {
    summary:
      "Everything you can be in a story, in one list. A persona is a name, a description the model reads as you, and an avatar. Click a row to open its editor. The crown marks your default, the one new chats start you as. Switching who you play happens in the persona switcher behind your avatar, not here.",
    affects: ["how the model sees you wherever a persona plays", "who new chats start you as (the crown)"],
    more: renderMarksLearn,
  },
  settings: [
    {
      id: "editor",
      label: "Editing a persona",
      keywords: [
        "name",
        "avatar",
        "title",
        "description",
        "placement",
        "depth",
        "world book",
        "connected",
        "connected characters",
        "duplicate",
        "export",
        "delete",
      ],
      teach: {
        summary:
          "A row opens into its editor: name, avatar, title, description, where the description goes in the prompt, one world book, and the characters it's connected to. Changes save as you type. Duplicate, Export and Delete are at the bottom of the editor.",
        affects: ["how the model sees you wherever this persona plays"],
        related: [leaf("placement-and-lore"), leaf("connected-characters")],
      },
    },
    {
      id: "default-persona",
      label: "Default persona (the crown)",
      keywords: ["default", "crown", "new chat", "start as", "join as"],
      teach: {
        summary:
          "The crown marks the persona new chats start you as, and the one you join someone's room as. Click the crown on a row to make it your default; click it again to clear it. The crown never changes a chat you already have.",
        affects: ["every new chat you start", "every room you join", "nothing already open"],
        overriddenBy: [
          { label: "A persona connected to the character", open: (): void => openConfigTo("personas", LIST_ID, "connected-characters") },
          { label: "A saved roster's persona", open: (): void => openConfigTo("rosterPreset") },
        ],
        related: [leaf("new-chat-start"), leaf("persona-pin")],
        more: renderCrownLearn,
      },
    },
    {
      id: "new-chat-start",
      label: "Who a new chat starts you as",
      keywords: ["order", "new chat", "last played", "connected", "default", "join", "sillytavern"],
      teach: {
        summary:
          "In order: the persona you picked for it, the one connected to the character (a one-on-one chat with exactly one connected), your default (the crown), then the persona you last played. Joining a room: your default, then the persona you last played. Switch in one chat and your next new chat still starts as your default.",
        affects: ["the first persona on your side in every new chat and every room you join"],
        related: [leaf("default-persona"), leaf("connected-characters")],
        more: renderStartOrderLearn,
      },
    },
    {
      id: "persona-pin",
      label: "The persona pin (📌)",
      keywords: ["pin", "{{user}}", "card sees you as", "host", "re-pin", "unpin", "swap", "anchor"],
      teach: {
        summary:
          "A chat's card calls one persona {{user}}, and it stays that persona even when you switch who you're playing: that's the pin. Your own lines and preset text follow whoever you're playing now. The host sets the pin in every chat, from the persona switcher with the chat open.",
        affects: ["what {{user}} means in a card's description, scenario, greeting, examples and its lore, in that chat", "nothing outside that chat"],
        related: [leaf("default-persona")],
        more: renderPinLearn,
      },
    },
    {
      id: "connected-characters",
      label: "Connected characters",
      keywords: ["connect", "connection", "character", "links", "lock to character"],
      teach: {
        summary:
          "Connect a persona to a character and a new one-on-one chat with that character starts you as that persona, ahead of your default. Connect from the persona's editor here, or from the character's Links tab. With two or more connected personas, none of them wins and your default is used.",
        affects: ["who new one-on-one chats with those characters start you as"],
        related: [leaf("new-chat-start"), leaf("default-persona")],
        more: renderConnectionsLearn,
      },
    },
    {
      id: "placement-and-lore",
      label: "Description placement and world book",
      keywords: ["placement", "in prompt", "depth", "role", "world book", "inject"],
      teach: {
        summary:
          "Placement is where the description goes: in the prompt beside the character's card (the default), spliced into the conversation at a depth and role, or not at all. A world book attached to a persona fires its entries whenever that persona is playing.",
        affects: ["where the model reads this persona's description", "which lore entries can fire while this persona plays"],
        related: [leaf("editor")],
        more: renderPlacementLearn,
      },
    },
    {
      id: "restamp-and-reattribute",
      label: "Restamp and Reattribute",
      keywords: ["restamp", "reattribute", "rename lines", "sync name", "relabel"],
      teach: {
        summary:
          "Restamp relabels every line you wrote in a chat to the persona you're playing now; it's in the persona switcher with the chat open. Reattribute from here, in a message's menu, does the same from that message onward. Your words never change, and replies keep the names they were written with.",
        affects: ["the name and avatar on your own past lines in one chat", "never the text, never the model's replies"],
        more: renderRestampLearn,
      },
    },
    {
      id: "coming-from-sillytavern",
      label: "Coming from SillyTavern",
      keywords: ["sillytavern", "default persona", "lock", "auto-lock", "chat lock", "character lock"],
      teach: {
        summary:
          "SillyTavern's default persona is our crown. Its “lock to character” is Connected characters. Its “lock to chat” is always on here: every chat remembers its own persona. New here is the persona pin, which keeps the card's {{user}} steady when you switch.",
        affects: ["how to read this page if you know SillyTavern's persona panel"],
        more: renderSillyTavernLearn,
      },
    },
  ],
};
