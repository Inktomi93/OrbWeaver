// The Learn tab bodies for Settings → Personas: in-app prose the teacher pane renders for a section or a
// concept leaf (`SettingTeach.more`). Plain functions with no hooks, so each is call-compatible with
// `() => ReactNode`. User-facing words only: "the card's {{user}}", "who you're playing", "the persona pin",
// "the crown", "the host".

import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

function learnBody(title: string, lines: readonly string[]): ReactElement {
  return (
    <Stack gap="field">
      <Text voice="label">{title}</Text>
      {lines.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
    </Stack>
  );
}

export function renderMarksLearn(): ReactElement {
  return learnBody("The four marks", [
    "In the persona switcher, a row can carry up to four marks.",
    "✓ Who you're playing in this chat. You change it by clicking the row.",
    "📌 Who the card's {{user}} is in this chat: the persona pin. The chat's host changes it.",
    "👑 Your default, the one new chats start you as. Click the crown to set or clear it.",
    "🔗 Connected to this chat's character. Shown only; connect under the character's Links tab or in the persona's editor.",
    "Settings is where personas are made and edited. The switcher is where you play.",
  ]);
}

export function renderCrownLearn(): ReactElement {
  return learnBody("Crown or pin?", [
    "The crown is about tomorrow: who your next chat starts you as. The pin is about one chat: who its card means by {{user}}, whatever you switch to inside it.",
    "Setting or clearing the crown never moves a pin. Setting or clearing a pin never moves the crown.",
    "With no crown, new chats start you as the persona you last played. Delete your default and the crown moves to the one you last played, and you're told.",
  ]);
}

export function renderStartOrderLearn(): ReactElement {
  return learnBody("The order, and why", [
    "1. The persona a roster or a start button named for this chat.",
    "2. The persona connected to the character, when the chat is one character with exactly one connected. Two or more connected: none of them wins.",
    "3. Your default, the crown.",
    "4. The persona you last played: whoever you most recently switched to, in any chat. It only decides anything when you have no crown.",
    "Every chat remembers its own persona after that. Switching in one chat changes that chat only.",
    'SillyTavern runs the same order: chat lock, connected, default, then whoever you last picked. The one difference: there, a mid-chat switch is forgotten when you reopen the chat unless you lock it; here, every chat keeps its persona, as if SillyTavern\'s "auto-lock" were always on.',
    "When a new chat starts you as someone other than your default, a notice says who and why. Notices are a switch under Personas → Notifications.",
  ]);
}

export function renderPinLearn(): ReactElement {
  return learnBody("Why the pin exists", [
    'You start a chat as John. The card says "{{user}} is my brother". Halfway through you switch to Sarah for a scene. Without the pin, the character now thinks Sarah is his brother. With it, "my brother" stays John.',
    "Card text (description, personality, scenario, greeting, examples, the card's own lore) reads {{user}} as the pinned persona. Preset text and your own lines read it as whoever you're playing now.",
    "A new chat pins whoever it started you as. The host sets the pin in every chat, including a chat that's just you and your characters: click 📌 on another of your personas to make the card mean them, click the pressed 📌 to clear it. Cleared, the card follows the host's persona.",
    "In a shared room the host can pin any present player's persona from the switcher's room section, and the card means that person for everyone. Other players see the pin and can't change it.",
    "If the pinned player leaves, the pin holds: the card keeps meaning them, so the story doesn't change who it's about. The room section says so and offers the host Re-pin.",
    "The pin is not the crown. The crown decides who new chats start you as; the pin decides who one chat's card means.",
  ]);
}

export function renderConnectionsLearn(): ReactElement {
  return learnBody("Connections", [
    "A connection is a standing preference: \"with this character, I'm usually this persona.\" It only acts when a chat is born, and only for a chat with that one character. Group chats don't use connections yet.",
    "In the switcher, 🔗 marks a persona connected to the open chat's character. It's a mark, not a button: connect or disconnect in the editor or on the character's Links tab.",
    'SillyTavern calls this "lock to character". It also offers a per-character ask when several personas are connected; here the tie goes to your default.',
  ]);
}

export function renderPlacementLearn(): ReactElement {
  return learnBody("Placement and lore", [
    "In the prompt is the usual choice: the description sits with the character's card, which is what prompt caching likes. At a depth puts it a number of messages back from the end, as a system, user or assistant line; depth 0 as assistant is a response prefill and isn't offered. Don't inject keeps the persona's name and avatar but sends no description.",
    "One world book per persona. Its entries join the chat's lore whenever this persona is playing, by keyword like any book.",
    'From SillyTavern: "In Story String / Prompt Manager" is In the prompt, "In-chat @ Depth" is At a depth, "None" is Don\'t inject. "Top" and "Bottom of Author\'s Note" have no home yet; an imported persona on either lands on In the prompt.',
  ]);
}

export function renderRestampLearn(): ReactElement {
  return learnBody("Which one, when", [
    "Switched personas halfway and want the whole chat to read as the new one? Restamp. Want the change to start where the scene changed? Open the menu on your first line of the new scene and choose Reattribute from here.",
    "Neither touches a character's reply, the model's memory of the chat, or a message's text. They change the label.",
    'SillyTavern\'s "set user name for all messages" is Restamp without the halfway option.',
  ]);
}

export function renderSillyTavernLearn(): ReactElement {
  return learnBody("The map", [
    "SillyTavern → Orbweaver",
    "Persona Management → Settings → Personas (edit) and the persona switcher behind your avatar (play)",
    "Default persona (the crown) → the crown",
    "Lock to character → Connected characters",
    "Lock to chat, Auto-lock → always on; every chat remembers its own persona",
    "Allow multiple persona connections → not a setting; a tie goes to your default",
    "Position: In Story String → In the prompt; In-chat @ Depth → At a depth; None → Don't inject; Top/Bottom of Author's Note → not supported yet",
    "Set user name for all messages → Restamp",
    "(nothing) → the persona pin",
    "Your SillyTavern personas come over with a whole-profile import under Backup & Restore; a persona has no file of its own there.",
  ]);
}
