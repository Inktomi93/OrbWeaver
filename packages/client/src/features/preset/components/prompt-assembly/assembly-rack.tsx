// AssemblyRack — the SECTION MANAGER (preset-surface-redesign.md §5.1): the request, top to bottom. One
// `<SortableList handle>` over all sections, the `chat_history` pivot included as a real sortable item. A
// completed drag diffs the new key order against the current one and calls `form.moveFieldValues`. Zones
// re-derive every render from the pivot index, so dragging the pivot re-zones live. A preset with no pivot
// shows a callout row carrying its own remedy; duplicate pivots render as inert warning bands.
//
// KEYBOARD REORDER IS THE SAME HOME (§16 row 17): `SortableList` ships dnd-kit's KeyboardSensor plus the
// mid-drag focus keeper, so Space/Enter + arrows moves a row and focus survives to the DROP. What this
// file owns is the per-row grip NAME (`handleLabel`) — a screen reader cannot tell N generic "Reorder
// item" grips apart, and a rack of twelve is exactly where that bites.
//
// The rack is an instrument ISLAND inside the form-tier editor (§2 — the density law's sanctioned reverse
// nesting): rows are `ListRow`-skinned, hairline-separated, no border boxes.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Stack, Surface } from "@orb/ui/layout";
import type { SortableItemKey } from "@orb/ui/sortable";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { isPivotSection } from "../../lib/assembly-model";
import { deriveZones } from "./derive-zones";
import { MARKER_COPY } from "./marker-copy";
import { PivotBand } from "./pivot-band";
import { diffMove } from "./reorder-move";
import { SectionRow } from "./section-row";

type AssemblyForm = AppFormInstance<PromptConfig>;

export interface AssemblyRackProps {
  readonly form: AssemblyForm;
  readonly selectedSectionId: string | null;
  /** SELECT (a row's name click) — the CONTEXT readout echoes; this is the INSPECT act. */
  readonly onSelectSection: (sectionId: string) => void;
  /** DRILL (a row's chevron) — open the consolidated section editor. */
  readonly onDrillSection: (sectionId: string) => void;
  /** Append a `chat_history` marker (the missing-pivot callout action). */
  readonly onAddChatHistory: () => void;
}

/** The grip's per-row accessible name — the rack's own labels, so "Reorder Main" reads instead of N
 *  identical "Reorder item"s. */
function reorderLabel(section: PromptSection): string {
  const name = section.name.trim();
  if (name !== "") {
    return `Reorder ${name}`;
  }
  return `Reorder ${section.type === "marker" ? MARKER_COPY[section.marker].label : "literal text"}`;
}

export function AssemblyRack({ form, selectedSectionId, onSelectSection, onDrillSection, onAddChatHistory }: AssemblyRackProps): ReactElement {
  return (
    <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
      {(sections): ReactElement => {
        const zones = deriveZones(sections);
        const duplicateSet = new Set(zones.duplicatePivotIndexes);

        const onReorder = (orderedKeys: SortableItemKey[]): void => {
          const before = sections.map((s) => s.id as SortableItemKey);
          const move = diffMove(before, orderedKeys);
          if (move !== null) {
            // The autosave BOUNDARY's store driver persists the reorder (D78 §3) — no manual flush.
            form.moveFieldValues("sections", move.from, move.to);
          }
        };

        return (
          <Surface tier="instrument">
            <Stack gap="tight">
              {zones.missingPivot ? (
                <Row align="center" className="rounded-base border border-warning bg-warning/10 text-warning" gap="row" padding="row">
                  <Icon icon={AlertTriangle} size="sm" />
                  <Text className="flex-1" size="micro" tone="warning">
                    No chat history marker — the conversation has nowhere to splice in.
                  </Text>
                  <Button intent="secondary" onClick={onAddChatHistory} size="sm" type="button">
                    Add chat history
                  </Button>
                </Row>
              ) : null}

              <SortableList
                getItemKey={(section): SortableItemKey => section.id}
                handle={true}
                handleLabel={reorderLabel}
                items={sections}
                onReorder={onReorder}
                renderItem={(section, index): ReactElement => {
                  if (isPivotSection(section)) {
                    return (
                      <PivotBand
                        duplicate={duplicateSet.has(index)}
                        onDrill={(): void => onDrillSection(section.id)}
                        onSelect={(): void => onSelectSection(section.id)}
                      />
                    );
                  }
                  return (
                    <SectionRow
                      form={form}
                      index={index}
                      onDrill={onDrillSection}
                      onSelect={onSelectSection}
                      section={section}
                      selected={section.id === selectedSectionId}
                      zone={zones.zoneOf(index)}
                    />
                  );
                }}
              />
            </Stack>
          </Surface>
        );
      }}
    </form.Subscribe>
  );
}
