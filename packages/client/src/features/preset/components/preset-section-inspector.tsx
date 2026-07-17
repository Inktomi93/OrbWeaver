// PresetSectionInspector — the CONTEXT Section-tab body. Reads the live editor form through the form
// bridge (`useAssemblyForm()` — CONTENT + CONTEXT are sibling shell regions with no shared React
// ancestor). A stale section id after delete yields the EmptyState, never a throw. Anatomy: header (title +
// the ONE ⋯ actions menu — Duplicate/Move-to-zone/Delete, north-star §2/§6.2) · identity ·
// placement/triggers/override-lock clusters. The section body lives in the CENTER `SectionBodyEditor`.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { EmptyState } from "@orb/ui/empty-state";
import { Copy, GitFork, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { RowActionsMenu } from "#components";
import type { AppFormInstance } from "#forms";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { useSelectedPresetId, useSelectedPresetSectionId } from "#state";
import { hasRoleField, headerCopy } from "../lib/assembly-model";
import { useAssemblyForm } from "../lib/preset-editor-bridge";
import { deriveZones } from "./prompt-assembly/derive-zones";
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

function InspectorBody({ form, section, index, onDismiss }: InspectorBodyProps): ReactElement {
  const { label, oneLiner } = headerCopy(section);
  return (
    <Stack gap="section" className="min-h-0 overflow-y-auto">
      <Row gap="field" align="start" justify="between">
        <Stack gap="field" className="min-w-0">
          <Text size="title" weight="semibold" className="truncate">
            {label}
          </Text>
          <Text size="micro" tone="muted">
            {oneLiner}
          </Text>
          <Text size="code" tone="muted">
            {section.id}
          </Text>
        </Stack>
        <SectionActionsMenu form={form} section={section} index={index} onDismiss={onDismiss} />
      </Row>

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
    </Stack>
  );
}

/** The ONE section-actions ⋯ menu (north-star §2 / §6.2) — Duplicate · Move-to-zone (conditional) items,
 *  Delete as the ConfirmDialog-wired destructive. Replaces the old bottom Duplicate/Move/Delete button row.
 *  The autosave BOUNDARY's store driver persists every structural array op (D78 §3) — no manual flush. */
function SectionActionsMenu({ form, section, index, onDismiss }: InspectorBodyProps): ReactElement {
  const onDelete = (): void => {
    void form.removeFieldValue("sections", index);
    onDismiss();
  };
  return (
    <RowActionsMenu
      label="Section actions"
      destructive={{
        title: "Delete this section?",
        description: "This removes the section from the preset's prompt arrangement. This can't be undone.",
        onConfirm: onDelete,
      }}
    >
      <MenuItem onClick={(): void => duplicate(form, section, index)}>
        <Icon icon={Copy} size="sm" />
        Duplicate
      </MenuItem>
      <MoveToZoneItem form={form} section={section} index={index} />
    </RowActionsMenu>
  );
}

/** Duplicate the section just below itself with a fresh id (content preserved). The store driver persists it. */
function duplicate(form: AssemblyForm, section: PromptSection, index: number): void {
  const clone: PromptSection = { ...section, id: globalThis.crypto.randomUUID() };
  void form.insertFieldValue("sections", index + 1, clone);
}

interface MoveToZoneItemProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
}

/** Move-to-zone menu item — splice the section across the pivot to the OTHER zone; the label flips by
 *  current zone. Renders nothing when there's no pivot or the section IS the pivot. */
function MoveToZoneItem({ form, section, index }: MoveToZoneItemProps): ReactElement | null {
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
          <MenuItem
            onClick={(): void => {
              form.moveFieldValues("sections", index, to > index ? to - 1 : to);
            }}
          >
            <Icon icon={GitFork} size="sm" />
            {inSetup ? "Move below" : "Move above"}
          </MenuItem>
        );
      }}
    </form.Subscribe>
  );
}
