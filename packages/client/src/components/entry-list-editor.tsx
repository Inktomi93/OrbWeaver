// EntryListEditor — the client-shared "editable entry list + editor dialog" composite (clone-audit item 4):
// a Section heading + helper line + a ListRow-per-entry list (click to edit, Remove action) + an Add button
// + the per-index editor dialog. Preset's Regex tab ↔ Variables tab pasted this shell verbatim; the settings
// owner-global Regex pane (item 10) is the third consumer. Form-agnostic on purpose — every array operation
// is a callback (onAdd/onRemove/onEdit) and the editor is `renderEditor`, so the composite never touches the
// TanStack Form generic and each consumer keeps its own field wiring + editor dialog.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — an app-level composite of Section+ListRow+the add/empty
// pattern; the ConfirmDialog homing precedent). Consumed across the preset + settings features.

import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface EntryListEditorProps<TItem> {
  /** The group's NAME. Rendered in the `kicker` voice — see the note at the render site. */
  readonly heading: string;
  /** The muted helper line under the heading. */
  readonly helperText: ReactNode;
  /** Copy shown when the list is empty. */
  readonly emptyText: string;
  /** The Add button label. */
  readonly addLabel: string;
  readonly items: readonly TItem[];
  readonly getTitle: (item: TItem, index: number) => string;
  readonly getSubtitle: (item: TItem, index: number) => string;
  readonly onAdd: () => void;
  readonly onRemove: (index: number) => void;
  readonly onEdit: (index: number) => void;
  /** The currently-edited index (`null` = no editor open). */
  readonly editIndex: number | null;
  /** Render the editor dialog for the given index (called only when `editIndex` is non-null). */
  readonly renderEditor: (index: number) => ReactNode;
}

/** The editable entry list + its per-index editor dialog. Generic over the row item type. */
export function EntryListEditor<TItem>({
  heading,
  helperText,
  emptyText,
  addLabel,
  items,
  getTitle,
  getSubtitle,
  onAdd,
  onRemove,
  onEdit,
  editIndex,
  renderEditor,
}: EntryListEditorProps<TItem>): ReactElement {
  return (
    // KICKER, NOT `heading` (side-eye F-8, 2026-08-03). Three group-heading grammars shipped across the
    // preset editor's five views: Params spoke in micro-caps kickers, Data spoke in large sentence-case
    // headings, Transforms spoke in BOTH — so flipping between tabs the type changed voice mid-sentence and
    // the surface read as if a different person had built each tab (Nielsen #4). The ARIA was already
    // consistent (`heading level=3` everywhere, which the kicker arm also renders); only the paint diverged.
    //
    // It is not a per-call-site knob, because a knob is how the divergence happened. This composite IS a
    // deck GROUP by definition — a named grouping of entries with a helper line — which is exactly the
    // CD1 "a grouping is not a box" case the kicker arm exists for, and every consumer of it (the preset
    // Data/Transforms tabs, the owner-global Regex pane, the rpg macro deck) is an instrument deck.
    <Section kicker={heading}>
      <Text size="micro" tone="muted">
        {helperText}
      </Text>

      <Stack gap="field">
        {items.length === 0 ? (
          <Text size="micro" tone="muted">
            {emptyText}
          </Text>
        ) : (
          items.map((item, index) => (
            <ListRow
              actions={
                <Button intent="ghost" onClick={(): void => onRemove(index)} size="sm">
                  Remove
                </Button>
              }
              clickable={true}
              // biome-ignore lint/suspicious/noArrayIndexKey: entries are a positional, id-less list edited in place by index — the index IS the row identity.
              key={index}
              onClick={(): void => onEdit(index)}
              subtitle={getSubtitle(item, index)}
              title={getTitle(item, index)}
            />
          ))
        )}
        <Row>
          <Button intent="secondary" onClick={onAdd} size="sm">
            <Icon icon={Plus} size="sm" />
            {addLabel}
          </Button>
        </Row>
      </Stack>

      {editIndex === null ? null : renderEditor(editIndex)}
    </Section>
  );
}
