// The "Reading typography" appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the
// ONE `SettingsSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split out
// so neither imports the other. The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory
// (§7.1).

import type { SettingsSubcategory } from "#state";

export const APPEARANCE_READING_SUBCATEGORY: SettingsSubcategory = {
  id: "reading-typography",
  label: "Reading typography",
  keywords: ["text", "prose", "font"],
  settings: [
    { id: "line-height", label: "Line height", keywords: ["leading", "spacing"] },
    { id: "letter-spacing", label: "Letter spacing", keywords: ["tracking", "kerning"] },
    { id: "paragraph-spacing", label: "Paragraph spacing" },
    { id: "name-scale", label: "Speaker name size" },
    { id: "body-scale", label: "Message text size" },
    { id: "justify", label: "Justify message text", keywords: ["align", "manuscript"] },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_READING_KEYS = [
  "readingLineHeight",
  "readingLetterSpacing",
  "readingParagraphSpacing",
  "readingNameScale",
  "readingBodyScale",
  "justifyBodyText",
] as const;
