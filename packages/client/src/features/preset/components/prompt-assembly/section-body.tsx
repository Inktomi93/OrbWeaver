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
import { ChevronDown, ChevronRight, ExternalLink, Icon, Info } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import type { AppFormInstance } from "#forms";
import { openConfigTo } from "#state";
import { isPlainMarkerSection, isTemplatedMarkerSection } from "../../lib/assembly-model.ts";
import { PresetMacroSuggestions } from "../preset-macro-suggestions.tsx";
import { CARRIER_ATTRIBUTION, MARKER_COPY } from "./marker-copy.ts";

type AssemblyForm = AppFormInstance<PromptConfig>;

const BODY_ROWS = 8;
/** A min-height floor — the Textarea's `field-sizing: content` otherwise collapses `rows` to ~2 lines. */
const BODY_MIN_H = "min-h-40";
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
      <PresetMacroSuggestions form={form}>
        {(suggestions): ReactElement => (
          <form.AppField name={`sections[${index}].content`}>
            {(field): ReactElement => <field.MacroField className={BODY_MIN_H} label="Text" rows={BODY_ROWS} suggestions={suggestions} />}
          </form.AppField>
        )}
      </PresetMacroSuggestions>
    );
  }
  if (isTemplatedMarkerSection(section)) {
    return <TemplatedMarkerBody form={form} index={index} section={section} />;
  }
  return <CarrierBody form={form} section={section} />;
}

/** A templated marker's FRAMING template — one textarea, ghosting the factory default. The two
 *  empty-default markers (`main_prompt`/`post_history`) ghost their explainer instead of bare nothing. */
function TemplatedMarkerBody({ form, section, index }: SectionBodyProps): ReactElement | null {
  if (!isTemplatedMarkerSection(section)) {
    return null;
  }
  const marker = section.marker;
  const factoryDefault = DEFAULT_MARKER_TEMPLATES[marker];
  const copy = MARKER_COPY[marker];
  // `section` is TYPED as `TemplatedMarkerSection` now (the predicate above narrowed it) — `.template`
  // reads directly; the old `"template" in section` runtime probe is no longer needed to prove it exists.
  const template = section.template;
  const name = `sections[${index}].template` as const;
  return (
    <Stack gap="field">
      {/* NO `<Field label="Template">` (side-eye F-32): the cluster kicker already says BODY and the
          drill-in header already names the section, so a third "Template" was the same idea three times.
          The accessible name rides `aria-label` — the datum reaches AT, the eye stops re-reading it. */}
      <PresetMacroSuggestions form={form}>
        {(suggestions): ReactElement => (
          <MacroTextarea
            aria-label="Template"
            className={BODY_MIN_H}
            // The empty string is NOT a stored state (§5.2a): clearing the field writes `undefined`, which
            // is exactly "the built-in default rides".
            onChange={(next): void => form.setFieldValue(name, next === "" ? undefined : next)}
            placeholder={factoryDefault === "" ? copy.oneLiner : factoryDefault}
            rows={BODY_ROWS}
            suggestions={suggestions}
            value={template ?? ""}
          />
        )}
      </PresetMacroSuggestions>
      <Text voice="gloss">
        Substance: {copy.subtitle}. {GHOST_PLACEHOLDER_HINT}
      </Text>
      {/* The mode-aware note (today only `main_prompt`): the ghost above shows the per-speaker default, so
          this is the one place the narrator arm — and the fact that ONE typed template covers both — is
          visible from the surface that edits it. */}
      {copy.templateNote === undefined ? null : <Text voice="gloss">{copy.templateNote}</Text>}
      {/* …AND THE BYTES IT NAMES (side-eye 2026-08-08 P2). The note said a narrator round gets a different
          framing and never showed it — `NARRATOR_MAIN_PROMPT_TEMPLATE` had zero client consumers, so the arm
          the author cannot see was the arm nothing printed. Disclosed rather than inlined, and ghosted like
          the per-speaker default in the field above: same muted ink, same read-only posture, because neither
          is editable here (one typed template replaces BOTH arms — which is exactly what the note says). */}
      {copy.templateNoteDetail === undefined || copy.templateNote === undefined ? null : <TemplateNoteDetail detail={copy.templateNoteDetail} />}
    </Stack>
  );
}

/** The `templateNote`'s bytes behind a disclosure — the house band grammar (`aria-expanded` button +
 *  `hidden` body) the Actions cluster bands and the Configuration list groups already speak, rather than
 *  the Accordion primitive: this is ONE row of read-only text, not a set of alternating panels. */
function TemplateNoteDetail({ detail }: { readonly detail: { readonly label: string; readonly text: string } }): ReactElement {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="tight">
      <Button
        aria-controls={bodyId}
        aria-expanded={open}
        className="self-start gap-tight"
        intent="ghost"
        onClick={(): void => setOpen((prev) => !prev)}
        size="sm"
        type="button"
      >
        <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
        {detail.label}
      </Button>
      <div hidden={!open} id={bodyId}>
        {open ? (
          <Text className="whitespace-pre-wrap" voice="gloss">
            {detail.text}
          </Text>
        ) : null}
      </div>
    </Stack>
  );
}

/** A PLAIN marker: the source-attribution panel (never editable, never blank) + world-info's shared
 *  entry wrapper. The nav link is the sanctioned cross-SURFACE navigation echo (§16 row 30) riding the
 *  standing `openConfigTo` intent — never a route fork. It carries the collection KIND, not just the
 *  section, because the Configuration list's groups start collapsed: a bare section switch would land a
 *  reader who asked for world info on a closed door. */
function CarrierBody({ form, section }: { readonly form: AssemblyForm; readonly section: PromptSection }): ReactElement | null {
  if (!isPlainMarkerSection(section)) {
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
            <Button className="self-start" intent="ghost" onClick={(): void => openConfigTo(manage.collection)} size="sm" type="button">
              {manage.label}
              <Icon icon={ExternalLink} size="xs" />
            </Button>
          )}
        </Stack>
      </Row>
      {isWorldInfo ? (
        // ONE LINE, not a 90px textarea (side-eye F-32): `wiFormat` is a one-line format string, and the
        // mock draws a single-line input. `rows={1}` + the Textarea's own `field-sizing: content` grows it
        // only if the author writes a multi-line wrapper. The explainer moves to the hover hint — the
        // datum ({{entry}}) is what stays visible (§4.1).
        <PresetMacroSuggestions form={form}>
          {(suggestions): ReactElement => (
            <form.AppField name="formatStrings.wiFormat">
              {(field): ReactElement => (
                <field.MacroField
                  hint="A format string framing EACH world book entry — {{entry}} is the entry text, and it is shared by both World-info markers. Blank uses {{entry}} alone."
                  label="Entry wrapper"
                  placeholder="{{entry}}"
                  rows={1}
                  suggestions={suggestions}
                />
              )}
            </form.AppField>
          )}
        </PresetMacroSuggestions>
      ) : null}
    </Stack>
  );
}
