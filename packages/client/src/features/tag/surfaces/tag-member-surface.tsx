// The tag MEMBER EDITOR — CONTENT for one selected tag (config-rail-spec.md §2 C-7 / fork F-11 arm (a)).
//
// This is the other half of the row split: every control that used to be crammed into the 330px settings
// row lives here, at full width, with room for its label — rename · both colour pickers · folder type ·
// hide-on-card · merge · delete. The BEHAVIOUR is unchanged and deliberately so: each control is still an
// independent immediate-commit tag mutation fired on change, not a draft form, so nothing about when a
// change lands moved when the controls did.
//
// It reads the tag out of the SAME `listTagsWithUsage` cache the rows render from (cache-first, no second
// fetch) — the row and the editor can never disagree about what a tag is.

import type { TagWithUsage, UpdateTagInput } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ColorField } from "@orb/ui/color-field";
import { EmptyState } from "@orb/ui/empty-state";
import { Field } from "@orb/ui/field";
import { Hash, Icon, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Heading, Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog, FormDialog } from "#components";
import type { Invalidation, Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { clearCollectionSelection } from "#state";
import { useMergeTags, useRemoveTag, useRenameTag, useUpdateTagStyle } from "../hooks/use-tag-settings-mutations";
import { FOLDER_TYPE_ITEMS, usageBreakdown, usageTotalLabel } from "../lib/tags-model";

/** Apply a partial patch to this tag (the immediate-commit style writer the sub-controls share). */
type PatchStyle = (patch: UpdateTagInput) => void;

export function TagMemberSurface({ memberId }: { readonly memberId: string }): ReactElement {
  const trpc = useTRPC();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const tag = tags.find((row) => row.id === memberId);
  if (tag === undefined) {
    // Reachable for real: another device deleted this tag while it was open here (the tag verbs are
    // bus-driven, so the list refetches under the editor). Say so instead of rendering a dead form.
    return <EmptyState description="This tag was deleted. Pick another on the left." icon={<Icon icon={Hash} size="lg" />} title="Tag not found" />;
  }
  return <TagMemberEditor others={tags.filter((other) => other.id !== tag.id)} tag={tag} />;
}

function TagMemberEditor({ tag, others }: { readonly tag: TagWithUsage; readonly others: readonly TagWithUsage[] }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const deps = { trpc, invalidation };
  const rename = useRenameTag(deps);
  const style = useUpdateTagStyle(deps);
  const remove = useRemoveTag(deps);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
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
    <Container>
    <Stack className="max-w-prose outline-none" data-slot="tag-member-editor" gap="block" ref={surfaceRef} tabIndex={-1}>
      <Row align="center" gap="field">
        <Heading level={2}>
          {tag.name}
        </Heading>
        <Text as="span" voice="datum">
          {usageTotalLabel(tag.usage.total)}
        </Text>
      </Row>

      <Field label="Name" name="tag-name">
        <Input
          onBlur={commitName}
          onKeyDown={(event): void => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          onValueChange={setName}
          value={name}
        />
      </Field>

      <TagColorControls patchStyle={patchStyle} tag={tag} />
      <TagBehaviorControls patchStyle={patchStyle} tag={tag} />

      <Row gap="field">
        <TagMergeControl invalidation={invalidation} others={others} tag={tag} trpc={trpc} />
        <Button intent="ghost" onClick={(): void => setDeleteOpen(true)} size="sm" type="button">
          <Icon icon={Trash2} size="sm" />
          Delete
        </Button>
      </Row>

      <ConfirmDialog
        confirmLabel="Delete"
        description={`This removes the tag from ${usageBreakdown(tag.usage)} and can't be undone.`}
        onConfirm={(): void => {
          remove.mutate({ tagId: tag.id });
          // The open member just stopped existing — land on the workspace welcome, not on a dead editor.
          clearCollectionSelection();
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${tag.name}"?`}
      />
    </Stack>
    </Container>
  );
}

/** The two colour pickers (chip background + text). An empty value maps to `null` (clear to the theme
 *  default) — the tri-state the row-era control already spoke. */
function TagColorControls({ tag, patchStyle }: { readonly tag: TagWithUsage; readonly patchStyle: PatchStyle }): ReactElement {
  return (
    <Row gap="field">
      <Field label="Background" name="tag-color">
        <ColorField
          onValueChange={(value): void => patchStyle({ color: value === "" ? null : value })}
          value={tag.color ?? ""}
        />
      </Field>
      <Field label="Text" name="tag-color2">
        <ColorField
          onValueChange={(value): void => patchStyle({ color2: value === "" ? null : value })}
          value={tag.color2 ?? ""}
        />
      </Field>
    </Row>
  );
}

/** The folder-type Select + the hide-on-card Switch — the tag's DISPLAY behavior, grouped as one concern. */
function TagBehaviorControls({ tag, patchStyle }: { readonly tag: TagWithUsage; readonly patchStyle: PatchStyle }): ReactElement {
  return (
    <Stack gap="block">
      <Field description="Whether this label also groups the library, and whether it opens by default." label="Folder type" name="tag-folder-type">
        <Select
          items={FOLDER_TYPE_ITEMS}
          onValueChange={(value): void => {
            if (value !== null) {
              patchStyle({ folderType: value });
            }
          }}
          value={tag.folderType}
        />
      </Field>
      <Row align="center" gap="field">
        <Switch
          aria-label={`Hide the ${tag.name} chip on cards`}
          checked={tag.isHiddenOnCard}
          onCheckedChange={(next): void => patchStyle({ isHiddenOnCard: next })}
        />
        <Text as="span" voice="gloss">
          Hide chip on cards — it still filters.
        </Text>
      </Row>
    </Stack>
  );
}

/** "Merge into…" — folds this tag into another (mergeTags), then deletes it. */
function TagMergeControl({
  tag,
  others,
  trpc,
  invalidation,
}: {
  readonly tag: TagWithUsage;
  readonly others: readonly TagWithUsage[];
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}): ReactElement {
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
    clearCollectionSelection();
  };

  return (
    <>
      <Button disabled={others.length === 0} intent="secondary" onClick={(): void => setOpen(true)} size="sm" type="button">
        Merge into…
      </Button>
      <FormDialog
        description="Every attachment moves to the tag you pick, then this tag is deleted. This can't be undone."
        onOpenChange={setOpen}
        open={open}
        submit={{ label: "Merge", onSubmit: confirmMerge, disabled: target === null }}
        title={`Merge "${tag.name}" into another tag`}
      >
        <Select
          aria-label="Merge target tag"
          items={others.map((other) => ({ label: other.name, value: other.id }))}
          onValueChange={(value: TagId | null): void => setTarget(value)}
          placeholder="Choose a tag…"
          value={target}
        />
      </FormDialog>
    </>
  );
}
