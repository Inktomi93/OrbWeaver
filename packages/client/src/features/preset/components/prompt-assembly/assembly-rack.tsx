// AssemblyRack — the request, top to bottom (BUILD-SPEC §3.3). ONE `<SortableList handle>` over ALL
// sections, the `chat_history` pivot INCLUDED as a real sortable item. `handle` mode = grip-only drag, so
// the row's own name-button/switch stay clickable and keyboard reorder ships free (sortable.tsx). A
// completed drag diffs the new key order against the current order and calls `form.moveFieldValues
// ("sections", from, to)` — the real TanStack array move. Zones RE-DERIVE every render from the first
// `chat_history` index (derive-zones), so dragging the pivot re-zones the rows + strip live; nothing is
// stamped on the sections. A preset with NO pivot shows a callout row (add chat history); duplicate pivots
// render as inert warning bands.

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

// diffMove lives in ./reorder-move (a tested pure lib — the naive first-divergence diff is wrong for
// any drag longer than one slot).

export interface AssemblyRackProps {
  readonly form: AssemblyForm;
  /** The CONTEXT-selected section id (highlights its row). */
  readonly selectedSectionId: string | null;
  /** Select a section → reveal the inspector (the route-built choreography, §3.4). */
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
  // `form.Subscribe` over the live sections array (the blessed live-read, character-advanced-tab
  // precedent) — a reorder / enable-toggle re-renders the rack; zones RE-DERIVE from the fresh order.
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
