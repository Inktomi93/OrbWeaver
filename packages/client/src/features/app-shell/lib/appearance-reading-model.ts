// The "Reading typography" appearance-section MODEL (SET-SEAMS §6, stage 1) — the section's two non-JSX facts: the
// ONE `ConfigSubcategory` shared by the contribution def and the section body's `<Section>` anchor stamp; split out
// so neither imports the other. The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory
// (§7.1).

import { APPEARANCE_OWNER_KEYS } from "#lib";
import type { ConfigSubcategory } from "#state";

export const APPEARANCE_READING_SUBCATEGORY: ConfigSubcategory = {
  id: "reading-typography",
  label: "Reading typography",
  keywords: ["text", "prose", "font"],
  teach: {
    summary: "Fine-grained control over how message text reads: line height, letter spacing, paragraph gaps, speaker-name sizing and message-body scaling.",
    affects: ["message body and speaker-name text in every chat, on this account"],
  },
  settings: [
    {
      id: "line-height",
      key: "readingLineHeight",
      label: "Line height",
      keywords: ["leading", "spacing"],
      teach: { summary: "Spacing between lines of message text.", affects: ["message body text in every chat"] },
    },
    {
      id: "letter-spacing",
      key: "readingLetterSpacing",
      label: "Letter spacing",
      keywords: ["tracking", "kerning"],
      teach: { summary: "Tracking applied to message text, in em.", affects: ["message body text in every chat"] },
    },
    {
      id: "paragraph-spacing",
      key: "readingParagraphSpacing",
      label: "Paragraph spacing",
      teach: { summary: "The gap between paragraphs inside one message, in rem.", affects: ["multi-paragraph messages in every chat"] },
    },
    {
      id: "name-scale",
      key: "readingNameScale",
      label: "Speaker name size",
      teach: { summary: "A multiplier on the attribution name text above each message.", affects: ["speaker names in every chat"] },
    },
    {
      id: "body-scale",
      key: "readingBodyScale",
      label: "Message text size",
      teach: {
        summary: "A multiplier on message body text, independent of the global text size.",
        affects: ["message body text only — the rest of the app keeps the global size"],
        related: [{ group: "appearance", sub: "sizing", setting: "font-scale" }],
      },
    },
    {
      id: "justify",
      key: "justifyBodyText",
      label: "Justify message text",
      keywords: ["align", "manuscript"],
      teach: { summary: "Aligns both edges of wrapped message text, manuscript style.", affects: ["paragraph edges in every chat"] },
    },
  ],
};

/** The `appearance` keys this section — and ONLY this section — WRITES (SET-SEAMS §2.3 S1/S2). ONE
 *  spelling, three consumers: the body's `pickKeys` projection + seeded defaults, its `Pick`-derived form
 *  type, and the contribution's `owns` claim — so "the patch names only the keys this section owns" is true
 *  by construction, and the door's `assertSettingsKeyPartition` proves the namespace stays a partition.
 *  Lives beside the nav entry (both are this section's non-JSX identity data, shared by the def and the
 *  body without either importing the other). */
export const APPEARANCE_READING_KEYS = APPEARANCE_OWNER_KEYS.reading;
