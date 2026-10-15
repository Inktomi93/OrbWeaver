// Shared preset/game entry lists keep callbacks index-addressed and editors caller-owned.
// Replacing the immutable items snapshot invalidates removal consent, not row or editor identity.

import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { removeActionName } from "#lib";
import { ConfirmDialog } from "./confirm-dialog.tsx";

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
  /** The consequence sentence in the Remove confirm, under "Remove <title>?". Per-LIST copy (what deleting
   *  this kind of entry costs), never per-row. Omit for the bare title-only confirm. */
  readonly removeDescription?: ReactNode;
  /** An extra per-row control, rendered in the trailing slot BEFORE Remove — for a scope/state switch that
   *  belongs to the row itself. It exists because the alternative shipped once and was a defect: the regex
   *  pane listed every script a SECOND time, 400px lower, purely to give each one a global switch (X-6). A
   *  property of a row lives on the row. */
  readonly renderRowAction?: (item: TItem, index: number) => ReactNode;
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
  removeDescription,
  renderRowAction,
}: EntryListEditorProps<TItem>): ReactElement {
  const [removal, setRemoval] = useState<{ readonly items: readonly TItem[]; readonly index: number | null; readonly invalidated: boolean }>({
    items,
    index: null,
    invalidated: false,
  });
  if (removal.items !== items) {
    setRemoval({ items, index: null, invalidated: removal.index !== null || removal.invalidated });
  }
  const addButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (removal.invalidated) {
      // An empty replacement unmounts every popup, so no native close remains to restore focus.
      addButton.current?.focus();
    }
  }, [removal.invalidated]);

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
                <Row align="center" gap="field">
                  {renderRowAction?.(item, index)}
                  {/* NAMED BY THE ROW IT KILLS: six rows each offering an unqualified "Remove" gave a
                      screen-reader user six identical buttons for six different scripts. */}
                  <ConfirmDialog
                    open={removal.items === items && removal.index === index}
                    onOpenChange={(open): void => setRemoval({ items, index: open ? index : null, invalidated: false })}
                    {...(removal.invalidated ? { finalFocus: addButton } : {})}
                    confirmLabel="Remove"
                    description={removeDescription}
                    // Callers can nest this list in a dialog, where Base UI otherwise suppresses its backdrop.
                    forceRender={true}
                    onConfirm={(): void => onRemove(index)}
                    title={`Remove “${getTitle(item, index)}”?`}
                    trigger={
                      <Button aria-label={removeActionName(getTitle(item, index))} intent="ghost" size="sm">
                        Remove
                      </Button>
                    }
                  />
                </Row>
              }
              clickable={true}
              // biome-ignore lint/suspicious/noArrayIndexKey: callbacks address current positions; removal consent separately expires when the items snapshot changes.
              key={index}
              onClick={(): void => onEdit(index)}
              subtitle={getSubtitle(item, index)}
              title={getTitle(item, index)}
            />
          ))
        )}
        <Row>
          <Button ref={addButton} intent="secondary" onClick={onAdd} size="sm">
            <Icon icon={Plus} size="sm" />
            {addLabel}
          </Button>
        </Row>
      </Stack>

      {editIndex === null ? null : renderEditor(editIndex)}
    </Section>
  );
}
