// AssemblyRack — the request, top to bottom. One `<SortableList handle>` over all sections, the
// `chat_history` pivot included as a real sortable item. A completed drag diffs the new key order against
// the current one and calls `form.moveFieldValues`. Zones re-derive every render from the pivot index, so
// dragging the pivot re-zones live. A preset with no pivot shows a callout row; duplicate pivots render
// as inert warning bands.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve these glyphs fine (the preset-library-surface.tsx precedent).
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SortableItemKey } from "@orb/ui/sortable";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { deriveZones } from "./derive-zones";
import { PivotBand } from "./pivot-band";
import { diffMove } from "./reorder-move";
import { SectionRow } from "./section-row";

type AssemblyForm = AppFormInstance<PromptConfig>;

export interface AssemblyRackProps {
  readonly form: AssemblyForm;
  readonly selectedSectionId: string | null;
  readonly onSelectSection: (sectionId: string) => void;
  /** Append a `chat_history` marker (the missing-pivot callout action). */
  readonly onAddChatHistory: () => void;
}

export function AssemblyRack({
  form,
  selectedSectionId,
  onSelectSection,
  onAddChatHistory,
}: AssemblyRackProps): ReactElement {
  return (
    <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
      {(sections): ReactElement => {
        const zones = deriveZones(sections);
        const duplicateSet = new Set(zones.duplicatePivotIndexes);

        const onReorder = (orderedKeys: SortableItemKey[]): void => {
          const before = sections.map((s) => s.id as SortableItemKey);
          const move = diffMove(before, orderedKeys);
          if (move !== null) {
            form.moveFieldValues("sections", move.from, move.to);
          }
        };

        return (
          <Stack gap="field">
            {zones.missingPivot ? (
              <Row
                gap="row"
                align="center"
                padding="row"
                className="rounded-card border border-warning bg-warning/10"
              >
                <Icon icon={AlertTriangle} size="sm" />
                <Text size="micro" tone="warning" className="flex-1">
                  No chat history marker — the conversation has nowhere to splice in.
                </Text>
                <Button intent="secondary" size="sm" onClick={onAddChatHistory}>
                  Add chat history
                </Button>
              </Row>
            ) : null}

            <SortableList
              handle={true}
              items={sections}
              getItemKey={(section): SortableItemKey => section.id}
              onReorder={onReorder}
              renderItem={(section, index): ReactElement => {
                if (section.type === "marker" && section.marker === "chat_history") {
                  return (
                    <PivotBand form={form} index={index} duplicate={duplicateSet.has(index)} />
                  );
                }
                return (
                  <SectionRow
                    form={form}
                    section={section}
                    index={index}
                    zone={zones.zoneOf(index)}
                    selected={section.id === selectedSectionId}
                    onSelect={onSelectSection}
                  />
                );
              }}
            />
          </Stack>
        );
      }}
    </form.Subscribe>
  );
}
