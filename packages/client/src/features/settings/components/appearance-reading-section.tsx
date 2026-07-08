// The "Reading typography" appearance section (Phase 4b §B.5.3), split out of
// `appearance-settings-surface.tsx` (UI-Arch §2.1 component-size gate, cap 450 lines — same reason
// `lib/appearance-select-items.ts` was split out earlier). Takes the LIVE autosave form instance as a
// prop (`AppFormInstance` minus `reset`, matching the exact shape `createAutosaveEntityForm` returns —
// `withForm`'s render-prop composition doesn't fit here: it binds against the FULL raw TanStack form
// API, which the autosave factory deliberately narrows/omits `reset` from), so this stays a normal
// leaf component — no form re-derivation, no `form: any` escape hatch.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { Section } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";

const READING_LINE_HEIGHT_MIN = 1.2;
const READING_LINE_HEIGHT_MAX = 2.2;
const READING_LINE_HEIGHT_STEP = 0.05;
const READING_LETTER_SPACING_MIN = -0.02;
const READING_LETTER_SPACING_MAX = 0.08;
const READING_LETTER_SPACING_STEP = 0.005;
const READING_PARAGRAPH_SPACING_MIN = 0;
const READING_PARAGRAPH_SPACING_MAX = 3;
const READING_PARAGRAPH_SPACING_STEP = 0.05;
const READING_SCALE_MIN = 0.8;
const READING_SCALE_MAX = 1.6;
const READING_SCALE_STEP = 0.05;

/** Message line-height/letter-spacing/paragraph-spacing/name+body scale + the justify toggle — root
 *  vars via `useAppearanceRootEffects`, consumed on `[data-slot="message-bubble"]`/
 *  `[data-slot="message-attribution"]` (globals.css). THE READING-SURFACE RULE: sizing/spacing only,
 *  never blur (that stays chrome-only). */
export function AppearanceReadingSection({
  form,
}: {
  readonly form: Omit<AppFormInstance<AppearanceSettings>, "reset">;
}): ReactElement {
  return (
    <Section heading="Reading typography">
      <form.AppField name="readingLineHeight">
        {(field): ReactElement => (
          <field.SliderField
            label="Line height"
            description="Spacing between lines of message text."
            min={READING_LINE_HEIGHT_MIN}
            max={READING_LINE_HEIGHT_MAX}
            step={READING_LINE_HEIGHT_STEP}
          />
        )}
      </form.AppField>
      <form.AppField name="readingLetterSpacing">
        {(field): ReactElement => (
          <field.SliderField
            label="Letter spacing"
            description="Tracking applied to message text (em)."
            min={READING_LETTER_SPACING_MIN}
            max={READING_LETTER_SPACING_MAX}
            step={READING_LETTER_SPACING_STEP}
          />
        )}
      </form.AppField>
      <form.AppField name="readingParagraphSpacing">
        {(field): ReactElement => (
          <field.SliderField
            label="Paragraph spacing"
            description="Gap between paragraphs inside one message (rem)."
            min={READING_PARAGRAPH_SPACING_MIN}
            max={READING_PARAGRAPH_SPACING_MAX}
            step={READING_PARAGRAPH_SPACING_STEP}
          />
        )}
      </form.AppField>
      <form.AppField name="readingNameScale">
        {(field): ReactElement => (
          <field.SliderField
            label="Speaker name size"
            description="A multiplier on the attribution name text."
            min={READING_SCALE_MIN}
            max={READING_SCALE_MAX}
            step={READING_SCALE_STEP}
          />
        )}
      </form.AppField>
      <form.AppField name="readingBodyScale">
        {(field): ReactElement => (
          <field.SliderField
            label="Message text size"
            description="A multiplier on message body text, independent of the global text size above."
            min={READING_SCALE_MIN}
            max={READING_SCALE_MAX}
            step={READING_SCALE_STEP}
          />
        )}
      </form.AppField>
      <form.AppField name="justifyBodyText">
        {(field): ReactElement => (
          <field.SwitchField
            label="Justify message text"
            description="Align both edges of wrapped message text (manuscript style)."
          />
        )}
      </form.AppField>
    </Section>
  );
}
