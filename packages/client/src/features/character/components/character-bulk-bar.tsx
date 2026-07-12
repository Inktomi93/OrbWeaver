// The §4.6 bulk selection bar — tag / archive / delete the selected characters (the bulk verbs). Lives in a
// COMPONENT (not the surface) so its interior Dialogs are legal: a surface renders no outer
// Dialog/Sheet/Drawer (client-structure surface-purity), but a component owning its own interior
// Dialog/AlertDialog is fine (the persona-panel-row / character-create-menu precedent). The Tag action's
// `bulkAddCardTag` takes a `tagName`, so the entry doubles as attach-existing or create-and-attach. Delete
// is a hard, undo-less server verb (`bulk-remove`) → it is gated behind an AlertDialog confirm stating the
// count (§13.8 R4 / FINAL-Character §11.1 — destructive confirms are the one legal INTERRUPT modal).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { SelectionBar } from "@orb/ui/selection-bar";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import {
  useBulkAddCardTag,
  useBulkArchiveCharacters,
  useBulkRemoveCharacters,
} from "../hooks/use-character-mutations";

export interface CharacterBulkBarProps {
  readonly ids: readonly string[];
  readonly selectedCount: number;
  readonly onClear: () => void;
  readonly trpc: Trpc;
}

/** The selection bar + its tag-picker Dialog. */
export function CharacterBulkBar({
  ids,
  selectedCount,
  onClear,
  trpc,
}: CharacterBulkBarProps): ReactElement {
  const invalidation = useInvalidation();
  const bulkTag = useBulkAddCardTag({ trpc, invalidation });
  const bulkArchive = useBulkArchiveCharacters({ trpc, invalidation });
  const bulkRemove = useBulkRemoveCharacters({ trpc, invalidation });
  const [tagOpen, setTagOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tagName, setTagName] = useState("");
  const characterIds = ids.map((id) => castId<CharacterId>(id));

  const applyTag = (): void => {
    const trimmed = tagName.trim();
    if (trimmed === "") {
      return;
    }
    bulkTag.mutate({ tagName: trimmed, characterIds });
    setTagOpen(false);
    setTagName("");
    onClear();
  };

  const confirmDelete = (): void => {
    bulkRemove.mutate({ characterIds });
    onClear();
  };

  return (
    <>
      {/* `size="sm"` (the SelectionBar usage default) so count + the three actions + clear fit a narrow LIST
          panel without clipping the trailing Delete (the ~337px panel regression). */}
      <SelectionBar count={selectedCount} onClear={onClear}>
        <Button intent="secondary" onClick={(): void => setTagOpen(true)} size="sm">
          Tag
        </Button>
        <Button
          intent="secondary"
          onClick={(): void => {
            bulkArchive.mutate({ characterIds, archived: true });
            onClear();
          }}
          size="sm"
        >
          Archive
        </Button>
        <Button intent="destructive" onClick={(): void => setDeleteOpen(true)} size="sm">
          Delete
        </Button>
      </SelectionBar>
      <Dialog onOpenChange={setTagOpen} open={tagOpen}>
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>{`Tag ${selectedCount} character${selectedCount === 1 ? "" : "s"}`}</DialogTitle>
            {/* Plain children — DialogDescription IS the <p>; a nested <Text> (also <p>) is invalid HTML. */}
            <DialogDescription>
              Attach an existing tag, or type a new one to create it.
            </DialogDescription>
            <Input
              aria-label="Tag name"
              onValueChange={setTagName}
              placeholder="e.g. adventure"
              value={tagName}
            />
            <Row gap="field" justify="end">
              <DialogClose render={<Button intent="ghost">Cancel</Button>} />
              <Button disabled={tagName.trim() === ""} intent="primary" onClick={applyTag}>
                Apply
              </Button>
            </Row>
          </Stack>
        </DialogPopup>
      </Dialog>
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
