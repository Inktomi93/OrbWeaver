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
    summary:
      "Fine-grained control over how message text reads: line spacing, letter spacing, message-body scaling and justification. Paragraph gaps follow the line spacing and speaker names follow the message size.",
    affects: ["message body and speaker-name text in every chat, on this account"],
  },
  settings: [
    {
      id: "line-height",
      key: "readingLineHeight",
      label: "Line spacing",
      keywords: ["leading", "spacing", "line height", "paragraph"],
      teach: {
        summary: "Spacing between lines of message text. The gap between paragraphs grows and shrinks with it.",
        affects: ["message body text in every chat", "the gap between paragraphs"],
      },
    },
    {
      id: "letter-spacing",
      key: "readingLetterSpacing",
      label: "Letter spacing",
      keywords: ["tracking", "kerning"],
      teach: { summary: "Tracking applied to message text, in em.", affects: ["message body text in every chat"] },
    },
    {
      id: "body-scale",
      key: "readingBodyScale",
      label: "Message text size",
      teach: {
        summary: "A multiplier on message body text, independent of the global text size. Speaker names scale with it.",
        affects: ["message body and speaker-name text only; the rest of the app keeps the global size"],
        related: [{ group: "appearance", sub: "sizing", setting: "font-scale" }],
      },
    },
    {
      id: "justify",
      key: "justifyBodyText",
      label: "Justify message text",
      keywords: ["align", "manuscript", "cjk", "chinese", "japanese", "korean"],
      teach: {
        summary:
          "Aligns both edges of wrapped message text. Suits Chinese, Japanese and Korean text; English justified on a narrow column opens wide gaps between words.",
        affects: ["paragraph edges in every chat"],
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
export const APPEARANCE_READING_KEYS = APPEARANCE_OWNER_KEYS.reading;
