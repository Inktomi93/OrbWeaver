// PresetSectionInspector — the CONTEXT Section-tab body. Reads the live editor form through the form
// bridge (`useAssemblyForm()` — CONTENT + CONTEXT are sibling shell regions with no shared React
// ancestor). A stale section id after delete/undo yields the EmptyState, never a throw. Anatomy: header ·
// identity · placement/triggers/override-lock clusters · footer (Duplicate/Move-to-zone/Delete). The
// section body lives in the CENTER `SectionBodyEditor`, not here.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Copy, GitFork, Icon, Trash2 } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { useSelectedPresetId, useSelectedPresetSectionId } from "#state";
import { hasRoleField } from "../lib/assembly-model";
import { useAssemblyForm } from "../lib/preset-editor-bridge";
import { deriveZones } from "./prompt-assembly/derive-zones";
import { MARKER_COPY } from "./prompt-assembly/marker-copy";
import { SectionLocksControl, SectionPlacementControl, SectionTriggersControl } from "./prompt-assembly/section-inspector-controls";

type AssemblyForm = AppFormInstance<PromptConfig>;

export interface PresetSectionInspectorProps {
  /** Dismiss the inspector — threaded into the Delete path so a mobile delete never strands a stale sheet. */
  readonly onDismiss: () => void;
}

/** The CONTEXT Section tab — resolves the selected section off the bridged form or shows the EmptyState. */
export function PresetSectionInspector({ onDismiss }: PresetSectionInspectorProps): ReactElement {
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
        return <InspectorBody form={handle.form} section={section} index={index} onDismiss={onDismiss} />;
      }}
    </handle.form.Subscribe>
  );
}

function SelectPrompt(): ReactElement {
  return <EmptyState title="Select a section to inspect it" description="Pick a row from the rack to edit its placement and triggers here." />;
}

interface InspectorBodyProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
  readonly onDismiss: () => void;
}

/** The header glyph label + one-liner for a section (marker copy, or a neutral literal framing). */
function headerCopy(section: PromptSection): { label: string; oneLiner: string } {
  if (section.type === "marker") {
    const copy = MARKER_COPY[section.marker];
    return { label: copy.label, oneLiner: copy.oneLiner };
  }
  return { label: "Literal text", oneLiner: "Your own text, sent exactly as written." };
}

function InspectorBody({ form, section, index, onDismiss }: InspectorBodyProps): ReactElement {
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
        <form.AppField name={`sections[${index}].name`}>{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>
        {hasRoleField(section) ? (
          <form.AppField name={`sections[${index}].role`}>
            {(field): ReactElement => (
              <field.SelectField label="Spoken as" description="Which conversation role this section is delivered with." items={MESSAGE_ROLE_ITEMS} />
            )}
          </form.AppField>
        ) : (
          <Text size="micro" tone="muted">
            The transcript carries each message's own speaker — no single role here.
          </Text>
        )}
      </Section>

      {section.type === "marker" && section.marker === "chat_history" ? null : <SectionPlacementControl form={form} section={section} index={index} />}

      <SectionTriggersControl form={form} section={section} index={index} />
      <SectionLocksControl form={form} section={section} index={index} />

      <InspectorFooter form={form} section={section} index={index} onDismiss={onDismiss} />
    </Stack>
  );
}

/** Duplicate · Move-to-zone (splice across the pivot) · Delete (recoverable — undo toast re-inserts). */
function InspectorFooter({ form, section, index, onDismiss }: InspectorBodyProps): ReactElement {
  const toast = useToastManager();
  // Recoverable delete: capture the removed section + index, drop it, dismiss, then offer an Undo re-insert.
  const onDelete = (): void => {
    const removed = section;
    const removedIndex = index;
    void form.removeFieldValue("sections", removedIndex);
    onDismiss();
    toast.add({
      title: "Section removed",
      actionProps: {
        children: "Undo",
        onClick: (): void => {
          void form.insertFieldValue("sections", removedIndex, removed);
        },
      },
    });
  };
  return (
    <Row gap="field" align="center" justify="between" className="flex-wrap">
      <Button intent="ghost" size="sm" onClick={(): void => duplicate(form, section, index)}>
        <Icon icon={Copy} size="sm" />
        Duplicate
      </Button>
      <MoveToZoneButton form={form} section={section} index={index} />
      <Button intent="destructive" size="sm" onClick={onDelete}>
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

interface MoveToZoneButtonProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
}

/** Move-to-zone — splice the section across the pivot to the OTHER zone; the label flips by current zone. */
function MoveToZoneButton({ form, section, index }: MoveToZoneButtonProps): ReactElement | null {
  return (
    <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
      {(sections): ReactElement | null => {
        const zones = deriveZones(sections);
        if (zones.missingPivot || (section.type === "marker" && section.marker === "chat_history")) {
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
