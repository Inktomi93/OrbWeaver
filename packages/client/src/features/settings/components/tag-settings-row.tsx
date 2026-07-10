// One row of the Settings → Tags management list — every per-tag control the tag domain exposes: rename
// (updateTag, name-conflict-aware), background/text color pickers (updateTag color/color2 — the WS2
// ColorField, empty = neutral/theme-default), the folder-type Select (NONE/OPEN/CLOSED), the
// hide-on-card Switch, "Merge into…" (a picker Dialog → mergeTags), and Delete (an AlertDialog confirm
// stating the cascade + usage). The drag GRIP is supplied by the parent SortableList (handle mode), so this
// renders only the row body.
//
// IMMEDIATE-COMMIT, NOT A DRAFT FORM (the character-tags-row.tsx precedent): each control is an INDEPENDENT
// tag-domain mutation fired on change — there is no seed/submit/reset lifecycle a form factory would bake, so
// the controls are grouped into small cohesive sub-components (colors · behavior · merge) rather than one
// hand-rolled multi-field form. Each mutation is `busDriven`, so the `tagsChanged` echo refetches
// `tag.listTagsWithUsage` for the acting + other devices.

import type { TagWithUsage, UpdateTagInput } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { ColorField } from "@orb/ui/color-field";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/Trash2 fine (the character-tags-row.tsx precedent).
import { Icon, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Invalidation, Trpc } from "#data";
import {
  useMergeTags,
  useRemoveTag,
  useRenameTag,
  useUpdateTagStyle,
} from "../hooks/use-tag-settings-mutations";
import { FOLDER_TYPE_ITEMS, usageBreakdown, usageTotalLabel } from "../lib/tags-settings-model";

/** Apply a partial patch to this tag (the immediate-commit style writer shared by the sub-controls). */
type PatchStyle = (patch: UpdateTagInput) => void;

export interface TagSettingsRowProps {
  readonly tag: TagWithUsage;
  /** Every other owned tag — the "Merge into…" picker's options (this tag excluded). */
  readonly others: readonly TagWithUsage[];
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** One tag's management row: color pickers · rename · folder · hide · merge · delete. */
export function TagSettingsRow({
  tag,
  others,
  trpc,
  invalidation,
}: TagSettingsRowProps): ReactElement {
  const deps = { trpc, invalidation };
  const rename = useRenameTag(deps);
  const style = useUpdateTagStyle(deps);
  const remove = useRemoveTag(deps);

  const [name, setName] = useState(tag.name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const patchStyle: PatchStyle = (patch) => style.mutate({ tagId: tag.id, patch });

  const commitName = (): void => {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed === tag.name) {
      setName(tag.name);
      return;
    }
    rename.mutate({ tagId: tag.id, patch: { name: trimmed } });
  };

  return (
    <Stack gap="field" data-slot="tag-settings-row">
      <Row gap="field" align="center" className="flex-wrap">
        <TagColorControls tag={tag} patchStyle={patchStyle} />
        <Input
          aria-label={`Tag name (${tag.name})`}
          className="min-w-(--width-sidebar-sm) flex-1"
          onBlur={commitName}
          onKeyDown={(event): void => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          onValueChange={setName}
          value={name}
        />
        <Badge intent={tag.usage.total === 0 ? "neutral" : "info"} size="sm">
          {usageTotalLabel(tag.usage.total)}
        </Badge>
      </Row>
      <Row gap="field" align="center" className="flex-wrap">
        <TagBehaviorControls tag={tag} patchStyle={patchStyle} />
        <TagMergeControl invalidation={invalidation} others={others} tag={tag} trpc={trpc} />
        <Button
          intent="ghost"
          size="sm"
          aria-label={`Delete ${tag.name}`}
          onClick={(): void => setDeleteOpen(true)}
        >
          <Icon icon={Trash2} size="sm" />
        </Button>
      </Row>

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogPopup>
          <Stack gap="block">
            <AlertDialogTitle>{`Delete "${tag.name}"?`}</AlertDialogTitle>
            {/* Plain children — AlertDialogDescription IS the <p>; a nested <Text> (also <p>) is invalid HTML. */}
            <AlertDialogDescription>
              {`This removes the tag from ${usageBreakdown(tag.usage)} and can't be undone.`}
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
              <AlertDialogClose
                render={
                  <Button
                    intent="destructive"
                    onClick={(): void => remove.mutate({ tagId: tag.id })}
                  >
                    Delete
                  </Button>
                }
              />
            </AlertDialogActions>
          </Stack>
        </AlertDialogPopup>
      </AlertDialog>
    </Stack>
  );
}

/** The two color pickers (chip background + text). The ColorField per-field clear (FINAL-Character §8.1)
 *  emits "" — mapped HERE to the `updateTag` tri-state `null` (clear the column to theme-default; the
 *  server's `undefined`="leave untouched" is never sent from a change event). A non-empty value is the
 *  literal color. `null` (theme default) reads back as "" so the swatch shows the neutral/inherit chip. */
function TagColorControls({
  tag,
  patchStyle,
}: {
  readonly tag: TagWithUsage;
  readonly patchStyle: PatchStyle;
}): ReactElement {
  return (
    <>
      <ColorField
        aria-label={`Background color for ${tag.name}`}
        onValueChange={(value): void => patchStyle({ color: value === "" ? null : value })}
        value={tag.color ?? ""}
      />
      <ColorField
        aria-label={`Text color for ${tag.name}`}
        onValueChange={(value): void => patchStyle({ color2: value === "" ? null : value })}
        value={tag.color2 ?? ""}
      />
    </>
  );
}

/** The folder-type Select + the hide-on-card Switch (the tag's display behavior). */
function TagBehaviorControls({
  tag,
  patchStyle,
}: {
  readonly tag: TagWithUsage;
  readonly patchStyle: PatchStyle;
}): ReactElement {
  return (
    <>
      <Select
        aria-label={`Folder type for ${tag.name}`}
        className="w-auto min-w-32"
        items={FOLDER_TYPE_ITEMS}
        onValueChange={(value): void => {
          if (value !== null) {
            patchStyle({ folderType: value });
          }
        }}
        value={tag.folderType}
      />
      <Row gap="field" align="center">
        <Switch
          aria-label={`Hide the ${tag.name} chip on cards`}
          checked={tag.isHiddenOnCard}
          onCheckedChange={(next): void => patchStyle({ isHiddenOnCard: next })}
        />
        <Text as="span" size="micro" tone="muted">
          Hide chip on cards
        </Text>
      </Row>
    </>
  );
}

/** "Merge into…" — a picker Dialog that folds this tag into another (mergeTags), then deletes it. */
function TagMergeControl({ tag, others, trpc, invalidation }: TagSettingsRowProps): ReactElement {
  const merge = useMergeTags({ trpc, invalidation });
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<TagId | null>(null);

  const confirmMerge = (): void => {
    if (target === null) {
      return;
    }
    merge.mutate({ sourceTagId: tag.id, targetTagId: target });
    setOpen(false);
    setTarget(null);
  };

  const items = others.map((other) => ({ label: other.name, value: other.id }));

  return (
    <>
      <Button
        intent="secondary"
        size="sm"
        disabled={others.length === 0}
        onClick={(): void => setOpen(true)}
      >
        Merge into…
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>{`Merge "${tag.name}" into another tag`}</DialogTitle>
            {/* Plain children — DialogDescription IS the <p>; a nested <Text> (also <p>) is invalid HTML. */}
            <DialogDescription>
              Every attachment moves to the tag you pick, then this tag is deleted. This can't be
              undone.
            </DialogDescription>
            <Select
              aria-label="Merge target tag"
              items={items}
              onValueChange={(value: TagId | null): void => setTarget(value)}
              placeholder="Choose a tag…"
              value={target}
            />
            <Row gap="field" justify="end">
              <DialogClose render={<Button intent="ghost">Cancel</Button>} />
              <Button disabled={target === null} intent="primary" onClick={confirmMerge}>
                Merge
              </Button>
            </Row>
          </Stack>
        </DialogPopup>
      </Dialog>
    </>
  );
}
