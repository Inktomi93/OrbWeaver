// The Message-style appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `ConfigSubcategory` shared by the contribution def (appearance-message-style-section.tsx) and the section body's
// `<Section>` anchor stamp; split out so neither imports the other (the library-settings-nav precedent, plus the
// owned-key tuple below).
//
// The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1: an anchor id keys on
// the PANE and the sub, never on the owning feature), so every existing deep link and search hit still lands here.
// The `density`/`elevation` leaves moved OUT to the app-shell sizing section — app-shell reads those two knobs, and
// ownership follows the reader (§6).

import { APPEARANCE_OWNER_KEYS } from "#lib";
import type { ConfigSubcategory } from "#state";
import { CHAT_STYLE_ITEMS } from "./appearance-select-items.ts";

export const APPEARANCE_MESSAGE_STYLE_SUBCATEGORY: ConfigSubcategory = {
  id: "message-style",
  label: "Message style",
  teach: {
    summary: "The shape of every message: bubbles, flat rows, document flow or the immersive skins, plus quoted-speech coloring and auto-fixed formatting.",
    affects: ["message row anatomy and text rendering in every chat, on this account"],
  },
  settings: [
    {
      id: "chat-style",
      key: "chatStyle",
      label: "Chat display",
      options: CHAT_STYLE_ITEMS,
      keywords: ["bubble", "flat", "document", "immersive", "echo", "whisper", "ripple"],
      teach: {
        summary: "How every message in the transcript is shaped — bubbles, flat rows, document flow, or the immersive skins.",
        affects: ["the anatomy of every message row, in every chat"],
      },
    },
    {
      id: "color-quoted-speech",
      key: "colorQuotedSpeech",
      label: "Color quoted speech",
      keywords: ["dialogue", "quotes", "speech"],
      teach: {
        summary:
          "Tints “quoted speech” with the theme's dialogue color (SillyTavern-style) — a character's own theme wins. Off renders quotes in the body color.",
        affects: ["quoted dialogue in every message"],
      },
    },
    {
      id: "auto-fix-markdown",
      key: "autoFixMarkdown",
      label: "Auto-fix unfinished formatting",
      keywords: ["markdown", "italic", "bold", "asterisk"],
      teach: {
        summary: "Closes a dangling *italic*/**bold** on settled messages (SillyTavern-style). Off keeps a lone asterisk — e.g. a censored word — literal.",
        affects: ["how settled messages render", "never the stored text itself"],
      },
    },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_MESSAGE_STYLE_KEYS = APPEARANCE_OWNER_KEYS["message-style"];
