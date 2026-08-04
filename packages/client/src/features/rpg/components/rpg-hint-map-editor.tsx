// The GM console's `custom label → steering gloss` RECORD editor — one block, two def planes: the M1
// relationship hints and the R4c journal-type hints. They are the same concept twice (a host-defined label that
// only steers as precisely as the host glosses it — the R4b measurement is why the unification calls a hint
// editor non-negotiable on every def plane), so they get the same gesture, cap and counter rather than two
// hand-rolled twins drifting apart.
//
// WHOLE-RECORD REPLACE on every commit (the `updateConfig` wire shape for both maps): an edit rewrites the map
// with the row changed, a removal rewrites it without the row. Adding an already-present label is a NO-OP — it
// would otherwise blank the gloss the host already wrote on it.

import { RPG_HINT_MAX } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Plus, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { AddRow, HintEditor } from "#components";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { Kicker } from "./rpg-kicker.tsx";

export interface RpgHintMapEditorProps {
  /** The section's kicker line. */
  readonly kicker: string;
  /** The doorway line shown when the map is empty — it must say what an empty map MEANS for this plane, never
   *  just "none" ([[empty-states-are-load-bearing]]). */
  readonly emptyLine: string;
  /** What one row's label is called, used to build the per-row accessible names ("journal type"). */
  readonly labelNoun: string;
  /** The add field's placeholder — the plane's own example. */
  readonly addPlaceholder: string;
  readonly hints: Readonly<Record<string, string>>;
  /** Persist the WHOLE next record (both consumers write it as one `updateConfig` patch field). */
  readonly onCommit: (next: Record<string, string>) => void;
  /** Optional prose under the kicker — the plane's own explanation of where the label comes from. */
  readonly children?: ReactNode;
}

/** The label→gloss record editor: one row per label, an add field, a hint editor on every row. */
export function RpgHintMapEditor({ kicker, emptyLine, labelNoun, addPlaceholder, hints, onCommit, children }: RpgHintMapEditorProps): ReactElement {
  const entries = Object.entries(hints);
  return (
    <Stack gap="field" data-slot="rpg-hint-map-editor">
      <Kicker>{kicker}</Kicker>
      {children}
      {entries.length === 0 ? <RpgDoorwayLine>{emptyLine}</RpgDoorwayLine> : null}
      {entries.map(([label, hint]) => (
        <Row key={label} gap="field" align="center">
          <Badge tone="soft" size="sm" intent="neutral">
            {label}
          </Badge>
          <HintEditor
            ariaLabel={`${label} hint`}
            hint={hint}
            max={RPG_HINT_MAX}
            placeholder="how this label steers…"
            onEdit={(next): void => onCommit({ ...hints, [label]: next })}
          />
          <Button
            intent="ghost"
            size="glyph-md"
            onClick={(): void => {
              const { [label]: _removed, ...rest } = hints;
              onCommit(rest);
            }}
            title={`Remove ${label}`}
          >
            <Icon icon={Trash2} size="xs" />
          </Button>
        </Row>
      ))}
      <AddRow
        ariaLabel={`New ${labelNoun}`}
        placeholder={addPlaceholder}
        actions={[
          {
            key: "label",
            label: "Add",
            icon: Plus,
            onAdd: (label: string): void => {
              // Re-adding an existing label would blank the gloss already written on it — a silent data loss
              // from a fat-finger. The row is already on screen; do nothing.
              if (!(label in hints)) {
                onCommit({ ...hints, [label]: "" });
              }
            },
          },
        ]}
      />
    </Stack>
  );
}
