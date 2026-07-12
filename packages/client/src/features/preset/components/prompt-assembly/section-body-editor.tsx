// SectionBodyEditor — the CENTER (CONTENT) drill-in for one selected section (the Assembly revamp). When
// a rack row is selected, the Prompt tab swaps the toolbar+strip+rack for THIS full-width editor: a
// "← Back to rack" button, the section's glyph + label + one-liner header, and the BIG body editor. It is
// IN-REGION (the Prompt tab already holds `form`), so it binds the form DIRECTLY via the `form` prop — no
// bridge (the CONTEXT inspector keeps the bridge; this is the sibling CENTER surface).
//
// The body collapses to ONE field, no Default/Custom/Silent tri-state:
//   • literal        → a MacroField bound to `sections[i].content` (empty by default).
//   • templated marker → ONE MacroTextarea bound to `sections[i].template`, DISPLAYING the built-in default
//     when unset (value = template ?? DEFAULT_MARKER_TEMPLATES[marker]); typing sets `template`. A subtle
//     "↺ Reset to default" ghost Button appears only when `template !== undefined`, clearing it back to
//     undefined so the built-in default re-shows and future default changes flow through.
//   • plain marker   → the explainer one-liner only (nothing to author — content comes from the card/lorebook).

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve these glyphs fine (the preset-library-surface.tsx precedent).
import { Anchor, ArrowLeft, Icon, Pencil, RotateCcw, Sparkles } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { isTemplatedMarker, sectionKind } from "../../lib/assembly-model";
import { PRESET_PROMPT_MACROS } from "../../lib/preset-prompt-macros";
import { MARKER_COPY } from "./marker-copy";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** ~16 rows tall — the full CONTENT-width authoring surface (spec change 3). */
const BODY_ROWS = 16;
/** A roomy min-height floor so the editor reads as a real authoring surface even for short/empty content —
 *  the Textarea's `field-sizing: content` (D54) otherwise collapses the `rows` hint to ~2 lines. Still grows. */
const BODY_MIN_H = "min-h-80";

export interface SectionBodyEditorProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
  /** Back to the rack view (clears the CONTEXT/CENTER section selection). */
  readonly onBack: () => void;
}

/** The glyph for a section (literal · templated marker · plain marker) — matches the rack row's cue. */
function sectionGlyph(section: PromptSection): ReactElement {
  const kind = sectionKind(section);
  if (kind === "literal") {
    return <Icon icon={Pencil} size="sm" />;
  }
  return <Icon icon={kind === "templatedMarker" ? Sparkles : Anchor} size="sm" />;
}

/** The header label + one-liner for a section (marker copy, or the neutral literal framing). */
function headerCopy(section: PromptSection): { label: string; oneLiner: string } {
  if (section.type === "marker") {
    const copy = MARKER_COPY[section.marker];
    return { label: copy.label, oneLiner: copy.oneLiner };
  }
  return { label: "Literal text", oneLiner: "Your own text, sent exactly as written." };
}

export function SectionBodyEditor({
  form,
  section,
  index,
  onBack,
}: SectionBodyEditorProps): ReactElement {
  const { label, oneLiner } = headerCopy(section);
  return (
    <Stack gap="section">
      <Row gap="row" align="center">
        <Button intent="ghost" size="sm" onClick={onBack}>
          <Icon icon={ArrowLeft} size="sm" />
          Back to rack
        </Button>
      </Row>

      <Stack gap="field">
        <Row gap="row" align="center">
          {sectionGlyph(section)}
          <Text size="title" weight="semibold">
            {label}
          </Text>
        </Row>
        <Text size="micro" tone="muted">
          {oneLiner}
        </Text>
      </Stack>

      <SectionBody form={form} section={section} index={index} />
    </Stack>
  );
}

/** The collapsed body — literal MacroField · templated single-field-with-default · plain explainer. */
function SectionBody({
  form,
  section,
  index,
}: Omit<SectionBodyEditorProps, "onBack">): ReactElement {
  if (section.type === "literal") {
    return (
      <form.AppField name={`sections[${index}].content`}>
        {(field): ReactElement => (
          <field.MacroField
            label="Text"
            suggestions={PRESET_PROMPT_MACROS}
            rows={BODY_ROWS}
            className={BODY_MIN_H}
          />
        )}
      </form.AppField>
    );
  }
  if (isTemplatedMarker(section.marker)) {
    return <TemplatedMarkerBody form={form} section={section} index={index} />;
  }
  return (
    <Text size="micro" tone="muted">
      This section fills in automatically — there's nothing to write here.
    </Text>
  );
}

/** ONE MacroTextarea bound to `template`, showing the built-in default when unset. The "↺ Reset to
 *  default" ghost appears only when a value is set (so a future default change can flow through again). */
function TemplatedMarkerBody({
  form,
  section,
  index,
}: Omit<SectionBodyEditorProps, "onBack">): ReactElement | null {
  if (section.type !== "marker" || !isTemplatedMarker(section.marker)) {
    return null;
  }
  const template = "template" in section ? section.template : undefined;
  const factoryDefault = DEFAULT_MARKER_TEMPLATES[section.marker];
  const name = `sections[${index}].template` as const;
  return (
    <Stack gap="field">
      <Field label="Template">
        <MacroTextarea
          aria-label="Template"
          value={template ?? factoryDefault}
          onChange={(next): void => {
            form.setFieldValue(name, next);
          }}
          suggestions={PRESET_PROMPT_MACROS}
          rows={BODY_ROWS}
          className={BODY_MIN_H}
        />
      </Field>
      {template !== undefined ? (
        <Row gap="row" align="center">
          <Button
            intent="ghost"
            size="sm"
            onClick={(): void => {
              form.setFieldValue(name, undefined);
            }}
          >
            <Icon icon={RotateCcw} size="sm" />
            Reset to default
          </Button>
        </Row>
      ) : null}
    </Stack>
  );
}
