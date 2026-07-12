// PresetSectionInspector — the CONTEXT Section-tab body (BUILD-SPEC §3.5). It reads the live editor form
// through THE FORM BRIDGE (`useAssemblyForm()` — CONTENT + CONTEXT are sibling shell regions, no shared
// React ancestor, so the form crosses via the published handle). The stale-id GUARD (`resolveAssemblySection`)
// gates on all three conditions (handle present · preset matches the LIST selection · section id resolves) —
// a stale id after delete/undo yields the EmptyState, NEVER a throw.
//
// Anatomy: header (glyph + marker label + one-liner + mono section id) · identity (name Input; role Select
// EXCEPT chat_history which carries the transcript's own roles) · the placement + triggers + override-lock
// clusters (section-inspector-controls) · footer (Duplicate · Move-to-zone · Delete). The section BODY is
// NOT here — it moved to the CENTER `SectionBodyEditor` (the CONTENT drill-in). Every field binds
// `sections[i].*` on the bridged form, so an edit round-trips through the editor's Save.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve these glyphs fine (the preset-library-surface.tsx precedent).
import { Copy, GitFork, Icon, Trash2 } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { clearPresetSection, useSelectedPresetId, useSelectedPresetSectionId } from "#state";
import { hasRoleField } from "../lib/assembly-model";
import { useAssemblyForm } from "../lib/preset-editor-bridge";
import { MESSAGE_ROLE_ITEMS } from "../lib/preset-nav";
import { deriveZones } from "./prompt-assembly/derive-zones";
import { MARKER_COPY } from "./prompt-assembly/marker-copy";
import {
  SectionLocksControl,
  SectionPlacementControl,
  SectionTriggersControl,
} from "./prompt-assembly/section-inspector-controls";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The CONTEXT Section tab — resolves the selected section off the bridged form or shows the EmptyState. */
export function PresetSectionInspector(): ReactElement {
  const handle = useAssemblyForm();
  const selectedPresetId = useSelectedPresetId();
  const selectedSectionId = useSelectedPresetSectionId();

  if (handle === null || selectedPresetId === null || handle.presetId !== selectedPresetId) {
    return <SelectPrompt />;
  }
  return (
    <handle.form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
      {(sections): ReactElement => {
        const index = sections.findIndex((s) => s.id === selectedSectionId);
        const section = index === -1 ? undefined : sections[index];
        if (section === undefined) {
          return <SelectPrompt />;
        }
        return <InspectorBody form={handle.form} section={section} index={index} />;
      }}
    </handle.form.Subscribe>
  );
}

function SelectPrompt(): ReactElement {
  return (
    <EmptyState
      title="Select a section to inspect it"
      description="Pick a row from the rack to edit its placement and triggers here."
    />
  );
}

interface InspectorBodyProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
}

/** The header glyph label + one-liner for a section (marker copy, or a neutral literal framing). */
function headerCopy(section: PromptSection): { label: string; oneLiner: string } {
  if (section.type === "marker") {
    const copy = MARKER_COPY[section.marker];
    return { label: copy.label, oneLiner: copy.oneLiner };
  }
  return { label: "Literal text", oneLiner: "Your own text, sent exactly as written." };
}

function InspectorBody({ form, section, index }: InspectorBodyProps): ReactElement {
  const { label, oneLiner } = headerCopy(section);
  return (
    <Stack gap="section" className="min-h-0 overflow-y-auto">
      <Stack gap="field">
        <Text size="title" weight="semibold">
          {label}
        </Text>
        <Text size="micro" tone="muted">
          {oneLiner}
        </Text>
        <Text size="code" tone="muted">
          {section.id}
        </Text>
      </Stack>

      <Section heading="Identity">
        <form.AppField name={`sections[${index}].name`}>
          {(field): ReactElement => <field.TextField label="Name" />}
        </form.AppField>
        {hasRoleField(section) ? (
          <form.AppField name={`sections[${index}].role`}>
            {(field): ReactElement => (
              <field.SelectField
                label="Spoken as"
                description="Which conversation role this section is delivered with."
                items={MESSAGE_ROLE_ITEMS}
              />
            )}
          </form.AppField>
        ) : (
          <Text size="micro" tone="muted">
            The transcript carries each message's own speaker — no single role here.
          </Text>
        )}
      </Section>

      {section.type === "marker" && section.marker === "chat_history" ? null : (
        <SectionPlacementControl form={form} section={section} index={index} />
      )}

      <SectionTriggersControl form={form} section={section} index={index} />
      <SectionLocksControl form={form} section={section} index={index} />

      <InspectorFooter form={form} section={section} index={index} />
    </Stack>
  );
}

/** Duplicate · Move-to-zone (splice across the pivot) · Delete (+ clear the selection → EmptyState). */
function InspectorFooter({ form, section, index }: InspectorBodyProps): ReactElement {
  return (
    <Row gap="field" align="center" justify="between" className="flex-wrap">
      <Button intent="ghost" size="sm" onClick={(): void => duplicate(form, section, index)}>
        <Icon icon={Copy} size="sm" />
        Duplicate
      </Button>
      <MoveToZoneButton form={form} section={section} index={index} />
      <Button intent="destructive" size="sm" onClick={(): void => remove(form, index)}>
        <Icon icon={Trash2} size="sm" />
        Delete
      </Button>
    </Row>
  );
}

/** Duplicate the section just below itself with a fresh id (content preserved). */
function duplicate(form: AssemblyForm, section: PromptSection, index: number): void {
  const clone: PromptSection = { ...section, id: globalThis.crypto.randomUUID() };
  void form.insertFieldValue("sections", index + 1, clone);
}

/** Delete the section + clear the CONTEXT selection (the bridge guard then shows the EmptyState). */
function remove(form: AssemblyForm, index: number): void {
  void form.removeFieldValue("sections", index);
  clearPresetSection();
}

/** Move-to-zone — splice the section across the pivot to the OTHER zone; the label flips by current zone. */
function MoveToZoneButton({ form, section, index }: InspectorBodyProps): ReactElement | null {
  return (
    <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
      {(sections): ReactElement | null => {
        const zones = deriveZones(sections);
        if (
          zones.missingPivot ||
          (section.type === "marker" && section.marker === "chat_history")
        ) {
          return null;
        }
        const inSetup = zones.zoneOf(index) === "setup";
        const to = inSetup ? zones.pivotIndex + 1 : zones.pivotIndex;
        return (
          <Button
            intent="ghost"
            size="sm"
            onClick={(): void => {
              form.moveFieldValues("sections", index, to > index ? to - 1 : to);
            }}
          >
            <Icon icon={GitFork} size="sm" />
            {inSetup ? "Move below" : "Move above"}
          </Button>
        );
      }}
    </form.Subscribe>
  );
}
