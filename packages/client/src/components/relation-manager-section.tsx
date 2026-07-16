// RelationManagerSection — the client-shared "titled section + summary list + add-picker Dialog" for a
// character's cross-entity links (W1 rollup). The two CharacterRelationsTab sections (linked world books ·
// connected personas) were byte-shape twins: a <Section> listing related items (each ListRow with a remove
// action) + a picker Dialog (trigger → popup listing the available items, each with an add action + Done).
// Real divergences (labels, id type, the mutations) ride props; the world-info attachment-rows toggle is a
// genuinely different cousin and stays per-site (the W2a diverged-twins doctrine). OWNER RULING: lives
// client-shared (a generic relation manager — the RowActionsMenu precedent; NOT @orb/ui, ui stays parts-only).

import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle, DialogTrigger } from "@orb/ui/dialog";
import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** One related/available entity in a relation section — the ListRow projection (id keeps its brand). */
export interface RelationManagerItem<TId extends string = string> {
  readonly id: TId;
  readonly title: string;
  readonly subtitle?: string;
}

export interface RelationManagerSectionProps<TId extends string> {
  /** The Section heading (e.g. "Linked world books"). */
  readonly heading: string;
  /** The currently-related items (the summary list). */
  readonly items: readonly RelationManagerItem<TId>[];
  /** Copy when `items` is empty (e.g. "No world books linked."). */
  readonly emptyLabel: string;
  /** The remove action's label (e.g. "Unlink"). */
  readonly removeLabel: string;
  /** Fires to remove a related item. */
  readonly onRemove: (item: RelationManagerItem<TId>) => void;
  /** The items available to add (the picker list — usually the full set minus `items`). */
  readonly available: readonly RelationManagerItem<TId>[];
  /** The picker trigger button's label (e.g. "Link a book"). */
  readonly addTriggerLabel: string;
  /** The picker dialog's title (e.g. "Link a world book"). */
  readonly addTitle: string;
  /** Copy when nothing is left to add (e.g. "Every book is already linked."). */
  readonly addEmptyLabel: string;
  /** The add action's label (e.g. "Link"). */
  readonly addLabel: string;
  /** Fires to add an available item. */
  readonly onAdd: (item: RelationManagerItem<TId>) => void;
}

function subtitleProp(item: RelationManagerItem): Record<string, string> {
  return item.subtitle === undefined ? {} : { subtitle: item.subtitle };
}

/**
 * The one relation-manager section — a titled list of related entities (each removable) plus an
 * add-picker Dialog listing what's left to attach. All writes are the caller's immediate mutations.
 */
export function RelationManagerSection<TId extends string>({
  heading,
  items,
  emptyLabel,
  removeLabel,
  onRemove,
  available,
  addTriggerLabel,
  addTitle,
  addEmptyLabel,
  addLabel,
  onAdd,
}: RelationManagerSectionProps<TId>): ReactElement {
  return (
    <Section heading={heading}>
      {items.length === 0 ? (
        <Text tone="muted">{emptyLabel}</Text>
      ) : (
        <Stack gap="row">
          {items.map((item) => (
            <ListRow
              key={item.id}
              title={item.title}
              {...subtitleProp(item)}
              actions={
                <Button intent="ghost" onClick={(): void => onRemove(item)}>
                  {removeLabel}
                </Button>
              }
            />
          ))}
        </Stack>
      )}
      <Dialog>
        <DialogTrigger render={<Button intent="secondary">{addTriggerLabel}</Button>} />
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>{addTitle}</DialogTitle>
            {available.length === 0 ? (
              <Text tone="muted">{addEmptyLabel}</Text>
            ) : (
              <Stack gap="row">
                {available.map((item) => (
                  <ListRow
                    key={item.id}
                    title={item.title}
                    {...subtitleProp(item)}
                    actions={
                      <Button intent="ghost" onClick={(): void => onAdd(item)}>
                        {addLabel}
                      </Button>
                    }
                  />
                ))}
              </Stack>
            )}
            <DialogClose render={<Button intent="ghost">Done</Button>} />
          </Stack>
        </DialogPopup>
      </Dialog>
    </Section>
  );
}
