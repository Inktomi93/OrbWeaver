// The Message-style appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the ONE
// `SettingsSubcategory` shared by the contribution def (appearance-message-style-section.tsx) and the section body's
// `<Section>` anchor stamp; split out so neither imports the other (the library-settings-nav precedent, plus the
// owned-key tuple below).
//
// The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1: an anchor id keys on
// the PANE and the sub, never on the owning feature), so every existing deep link and search hit still lands here.
// The `density`/`elevation` leaves moved OUT to the app-shell sizing section — app-shell reads those two knobs, and
// ownership follows the reader (§6).

import type { SettingsSubcategory } from "#state";

export const APPEARANCE_MESSAGE_STYLE_SUBCATEGORY: SettingsSubcategory = {
  id: "message-style",
  label: "Message style",
  settings: [
    { id: "chat-style", label: "Chat display", keywords: ["bubble", "flat", "document", "immersive", "echo", "whisper", "ripple"] },
    { id: "color-quoted-speech", label: "Color quoted speech", keywords: ["dialogue", "quotes", "speech"] },
    { id: "auto-fix-markdown", label: "Auto-fix unfinished formatting", keywords: ["markdown", "italic", "bold", "asterisk"] },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_MESSAGE_STYLE_KEYS = ["chatStyle", "colorQuotedSpeech", "autoFixMarkdown"] as const;
