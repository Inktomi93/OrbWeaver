// The §4.6 bulk selection bar — tag / archive / delete the selected characters (the bulk verbs). Lives in a
// COMPONENT (not the surface) so its interior Dialogs are legal: a surface renders no outer
// Dialog/Sheet/Drawer (client-structure surface-purity), but a component owning its own interior
// Dialog/AlertDialog is fine (the persona-panel-row / character-create-actions precedent). The Tag action's
// `bulkAddCardTag` takes a `tagName`, so the entry doubles as attach-existing or create-and-attach. Delete
// is a hard, undo-less server verb (`bulk-remove`) → it is gated behind an AlertDialog confirm stating the
// count (§13.8 R4 — destructive confirms are the one legal INTERRUPT modal).
//
// ITS LABELS ARE THE `bulk` SLICE OF ONE VOCABULARY (`../lib/character-actions.ts`, #838) — the same
// registry the list row's kebab and the CONTEXT pane's `Character actions` read, so the three surfaces can
// no longer drift into three names for one verb. This bar renders BUTTONS, not menu items, so it owns its
// own chrome (no glyphs, `intent="destructive"` on the last one) and takes only the labels + order.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { SelectionBar } from "@orb/ui/selection-bar";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, TagPickerDialog } from "#components";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { useBulkAddCardTag, useBulkArchiveCharacters, useBulkRemoveCharacters } from "../hooks/use-character-mutations.ts";
import type { CHARACTER_ACTION_SCOPE_IDS } from "../lib/character-actions.ts";
import { characterActionsForScope } from "../lib/character-actions.ts";

/** File-local — exactly the verbs the `bulk` scope offers. */
type BulkActionId = (typeof CHARACTER_ACTION_SCOPE_IDS)["bulk"][number];

export interface CharacterBulkBarProps {
  readonly ids: readonly string[];
  readonly selectedCount: number;
  readonly onClear: () => void;
  readonly onRemoveSubmitted: (ids: readonly string[]) => void;
  readonly trpc: Trpc;
}

/** The selection bar + its tag-picker Dialog. */
export function CharacterBulkBar({ ids, selectedCount, onClear, onRemoveSubmitted, trpc }: CharacterBulkBarProps): ReactElement {
  const invalidation = useInvalidation();
  const bulkTag = useBulkAddCardTag({ trpc, invalidation });
  const bulkArchive = useBulkArchiveCharacters({ trpc, invalidation });
  const bulkRemove = useBulkRemoveCharacters({ trpc, invalidation });
  const [tagOpen, setTagOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const characterIds = ids.map((id) => castId<CharacterId>(id));
  const isPending = bulkTag.isPending || bulkArchive.isPending || bulkRemove.isPending;

  const applyTag = (name: string): void => {
    void bulkTag
      .mutateAsync({ tagName: name, characterIds })
      .then(() => onRemoveSubmitted(characterIds))
      .catch(() => undefined);
  };

  const confirmDelete = (): void => {
    void bulkRemove
      .mutateAsync({ characterIds })
      .then(() => onRemoveSubmitted(characterIds))
      .catch(() => undefined);
  };

  /** Every verb the `bulk` scope offers, wired — a verb added to that scope is a `tsc` error here until it
   *  has a handler. Nothing is `null`: a selection bar has no destructive SLOT, so Delete is a button like
   *  the others (its confirm is the AlertDialog below). */
  const bulkHandlers: Readonly<Record<BulkActionId, () => void>> = {
    tag: (): void => setTagOpen(true),
    archive: (): void => {
      void bulkArchive
        .mutateAsync({ characterIds, archived: true })
        .then(() => onRemoveSubmitted(characterIds))
        .catch(() => undefined);
    },
    delete: (): void => setDeleteOpen(true),
  };

  return (
    <>
      {/* `size="sm"` (the SelectionBar usage default) so count + the three actions + clear fit a narrow LIST
          panel without clipping the trailing Delete (the ~337px panel regression). */}
      <SelectionBar count={selectedCount} onClear={onClear}>
        {characterActionsForScope("bulk").map((action) => (
          // Bulk archive never toggles (it always archives), so the label is the verb's one name — never
          // `characterActionLabel`'s toggled face.
          // QUIETER, AND THE SAME WEIGHT AS ITS SIBLINGS (side-eye 2026-09-02 F10). Delete was the ONLY
          // filled control in the bar — `bg oklch(0.72 0.19 25)` at the right edge, i.e. the scan position a
          // reader takes as "confirm", beside two transparent ghosts. §5 error prevention: the irreversible
          // act must not be the visually primary one. It is a `secondary` like Tag and Archive now; the
          // destructive INTENT is carried where it belongs, by the AlertDialog confirm below, which states
          // the count and spells out that it cannot be undone.
          <Button disabled={isPending} intent="secondary" key={action.id} onClick={bulkHandlers[action.id]} size="sm">
            {action.label}
          </Button>
        ))}
      </SelectionBar>
      <TagPickerDialog
        confirmLabel="Apply"
        description="Attach an existing tag, or type a new one to create it."
        onOpenChange={setTagOpen}
        onSubmit={applyTag}
        open={tagOpen}
        title={`Tag ${selectedCount} character${selectedCount === 1 ? "" : "s"}`}
      />
      <ConfirmDialog
        confirmLabel="Delete"
        description="This permanently deletes them. This can't be undone."
        onConfirm={confirmDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete ${selectedCount} character${selectedCount === 1 ? "" : "s"}?`}
      />
    </>
  );
}
