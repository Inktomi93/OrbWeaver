// The section drill-in's BODY slot, branching by section KIND (preset-surface-redesign.md §5.2). The
// schema branch is the authority — a PLAIN marker carries no `template` field, and that absence IS the
// carrier distinction; no flag is invented:
//
//   literal          → the MacroField body editor (the author's own text)
//   templated marker → ONE textarea for the FRAMING template, ghosting the built-in default when empty,
//                      plus a SOURCE line naming where the substance flows from (the template FRAMES
//                      carrier content — it is not the content)
//   plain marker     → a SOURCE-ATTRIBUTION panel: never a textarea, never blank. World-info adds the
//                      shared `formatStrings.wiFormat` ENTRY WRAPPER beneath it, labeled as the format
//                      string it is (framing each entry, not the body).
//
// §5.2a — THE TRI-STATE IS DEAD (owner-ruled): Default/Custom/Silent was three-state vocabulary for what
// two mechanisms already express. There is ONE textarea now: empty = the built-in default rides (ghosted
// in the field), typed = custom, CLEAR = reset — the same grammar the Actions templates speak (§16 row
// 24). OFF is solely the enable toggle. The write maps `""` → `undefined` so the retired "render nothing"
// arm is unrepresentable from the editor (the v4→v5 lift retires the stored ones, contracts G8).

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { ExternalLink, Icon, Info } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { PROMPT_MACRO_SUGGESTIONS } from "#lib";
import { setActiveSection } from "#state";
import { isTemplatedMarker } from "../../lib/assembly-model";
import { CARRIER_ATTRIBUTION, MARKER_COPY } from "./marker-copy";

type AssemblyForm = AppFormInstance<PromptConfig>;

const BODY_ROWS = 14;
/** A min-height floor — the Textarea's `field-sizing: content` otherwise collapses `rows` to ~2 lines. */
const BODY_MIN_H = "min-h-64";
/** The one ghost/reset sentence, shared by every authored body so the grammar reads identically. */
const GHOST_PLACEHOLDER_HINT = "Leave it empty and the built-in default rides — clearing the field IS the reset.";

export interface SectionBodyProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
}

export function SectionBody({ form, section, index }: SectionBodyProps): ReactElement {
  if (section.type === "literal") {
    return (
      <form.AppField name={`sections[${index}].content`}>
        {(field): ReactElement => <field.MacroField className={BODY_MIN_H} label="Text" rows={BODY_ROWS} suggestions={PROMPT_MACRO_SUGGESTIONS} />}
      </form.AppField>
    );
  }
  if (isTemplatedMarker(section.marker)) {
    return <TemplatedMarkerBody form={form} index={index} section={section} />;
  }
  return <CarrierBody form={form} section={section} />;
}

/** A templated marker's FRAMING template — one textarea, ghosting the factory default. The two
 *  empty-default markers (`main_prompt`/`post_history`) ghost their explainer instead of bare nothing. */
function TemplatedMarkerBody({ form, section, index }: SectionBodyProps): ReactElement | null {
  if (section.type !== "marker" || !isTemplatedMarker(section.marker)) {
    return null;
  }
  const marker = section.marker;
  const factoryDefault = DEFAULT_MARKER_TEMPLATES[marker];
  const copy = MARKER_COPY[marker];
  const template = "template" in section ? section.template : undefined;
  const name = `sections[${index}].template` as const;
  return (
    <Stack gap="field">
      <Field label="Template">
        <MacroTextarea
          aria-label="Template"
          className={BODY_MIN_H}
          // The empty string is NOT a stored state (§5.2a): clearing the field writes `undefined`, which
          // is exactly "the built-in default rides".
          onChange={(next): void => form.setFieldValue(name, next === "" ? undefined : next)}
          placeholder={factoryDefault === "" ? copy.oneLiner : factoryDefault}
          rows={BODY_ROWS}
          suggestions={PROMPT_MACRO_SUGGESTIONS}
          value={template ?? ""}
        />
      </Field>
      <Text voice="gloss">
        Substance: {copy.subtitle}. {GHOST_PLACEHOLDER_HINT}
      </Text>
    </Stack>
  );
}

/** A PLAIN marker: the source-attribution panel (never editable, never blank) + world-info's shared
 *  entry wrapper. The nav link is the sanctioned cross-SECTION navigation echo (§16 row 30) riding the
 *  standing rail store writer — never a route fork. */
function CarrierBody({ form, section }: { readonly form: AssemblyForm; readonly section: PromptSection }): ReactElement | null {
  if (section.type !== "marker" || isTemplatedMarker(section.marker)) {
    return null;
  }
  const attribution = CARRIER_ATTRIBUTION[section.marker];
  const manage = attribution.manage;
  const isWorldInfo = section.marker === "world_info_before" || section.marker === "world_info_after";
  return (
    <Stack gap="field">
      <Row align="start" className="rounded-base border border-border bg-muted/40" gap="row" padding="row">
        <Icon icon={Info} size="sm" />
        <Stack className="min-w-0" gap="tight">
          <Text voice="label">{attribution.sentence}</Text>
          {manage === undefined ? null : (
            <Button className="self-start" intent="ghost" onClick={(): void => setActiveSection(manage.sectionId)} size="sm" type="button">
              {manage.label}
              <Icon icon={ExternalLink} size="xs" />
            </Button>
          )}
        </Stack>
      </Row>
      {isWorldInfo ? (
        <form.AppField name="formatStrings.wiFormat">
          {(field): ReactElement => (
            <field.MacroField
              description="A format string framing EACH lorebook entry — {{entry}} is the entry text, and it is shared by both World-info markers. Blank uses {{entry}} alone."
              label="Entry wrapper"
              rows={3}
              suggestions={PROMPT_MACRO_SUGGESTIONS}
            />
          )}
        </form.AppField>
      ) : null}
    </Stack>
  );
}
