// The tag MEMBER EDITOR — CONTENT for one selected tag (config-rail-spec.md §2 C-7 / fork F-11 arm (a)).
//
// This is the other half of the row split: every EDITING control that used to be crammed into the 330px
// settings row lives here, at full width, with room for its label — rename · both colour pickers · folder
// type · hide-on-card · merge. The BEHAVIOUR is unchanged and deliberately so: each control is still an
// independent immediate-commit tag mutation fired on change, not a draft form, so nothing about when a
// change lands moved when the controls did.
//
// DELETE IS NOT HERE — it converged onto the ROW's kebab (config-delete #271), the same place world-info and
// regex rows home it, so a user finds Delete in one place across all three config collections. Merge STAYS
// (it is a distinct fold-into-another verb that needs the target picker), and it is the editor's only
// destructive control now. See `tag-collection-rows.tsx` for the ruling-survives-input-changed note.
//
// It reads the tag out of the SAME `listTagsWithUsage` cache the rows render from (cache-first, no second
// fetch) — the row and the editor can never disagree about what a tag is.

import type { TagWithUsage, UpdateTagInput } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ColorField } from "@orb/ui/color-field";
import { EmptyState } from "@orb/ui/empty-state";
import { Field } from "@orb/ui/field";
import { Hash, Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { MemberDrillBack } from "#components";
import { FormDialog, MemberDrillHeader } from "#components";
import type { Invalidation, Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionMemberView } from "#lib";
import { useFocusOnMount } from "#lib";
import { clearCollectionSelection } from "#state";
import { useMergeTags, useRenameTag, useUpdateTagStyle } from "../hooks/use-tag-settings-mutations.ts";
import { FOLDER_TYPE_ITEMS, tagColorValueLabel, usageTotalLabel } from "../lib/tags-model.ts";

/** Apply a partial patch to this tag (the immediate-commit style writer the sub-controls share). */
type PatchStyle = (patch: UpdateTagInput) => void;

export function TagMemberSurface({ view }: { readonly view: CollectionMemberView }): ReactElement {
  const trpc = useTRPC();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const tag = tags.find((row) => row.id === view.memberId);
  const back = { label: `Back to ${view.library}`, onClick: (): void => clearCollectionSelection() };
  if (tag === undefined) {
    // Reachable for real: another device deleted this tag while it was open here (the tag verbs are
    // bus-driven, so the list refetches under the editor). Say so instead of rendering a dead form — and
    // KEEP THE EXIT (#1747): the drill row is this surface's now, so a gone-member arm that dropped it
    // would strand a drilled reader with no way back to the library.
    return (
      <Stack gap="block">
        <MemberDrillHeader back={back} />
        <EmptyState description="This tag was deleted. Pick another from the list." icon={<Icon icon={Hash} size="lg" />} title="Tag not found" />
      </Stack>
    );
  }
  return <TagMemberEditor back={back} others={tags.filter((other) => other.id !== tag.id)} tag={tag} />;
}

function TagMemberEditor({
  tag,
  others,
  back,
}: {
  readonly tag: TagWithUsage;
  readonly others: readonly TagWithUsage[];
  readonly back: MemberDrillBack;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const deps = { trpc, invalidation };
  const rename = useRenameTag(deps);
  const style = useUpdateTagStyle(deps);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const [name, setName] = useState(tag.name);

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
      {/* `--width-content-col` — the ruled cap for an EDITOR's content column, not a reading measure
          (#1175). This block holds controls, and the prose token's own contract forbids it here: a `ch`
          resolves in the element's own font, so a measure inherited from a wrapper reads at the wrong scale
          (the #213/#1130 failure) and "a block holding controls keeps the wider measure while the paragraph
          inside it takes this one". It used to spell `max-w-prose`, a third un-derived width.

          THE TOKEN'S STATED CONSUMPTION IS THREE CLASSES, NOT ONE (#1664). `--width-content-col`'s own
          `$description` says the column is CENTERED and BREATHES to `--width-content-col-wide` once its
          container clears `@5xl`; the first spelling took the bare cap, so this editor LEFT-PINNED 720px
          inside the pane and left the rest dead — the exact defect the breathe step was minted for (owner,
          2026-08-02: "looks okay when both panels are out, but when you close them it looks awful").
          MEASURED on the real shell (snap --isolated, 2026-09-05): the config CONTENT pane this editor
          lands in is 520px at 1280 both-docked, 869px list-only, 1176px in focus mode, and 920 / 1816px at
          1920 — so the `@5xl` arm is REACHED (focus mode at every desktop width) and is not dead code. The
          query container is the `<Container>` directly above, which is why the cap and the container are
          two elements. `w-full` rides with `mx-auto` because the pane is a flex column. */}
      <Stack
        className="mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide) outline-none"
        data-slot="tag-member-editor"
        gap="block"
        ref={surfaceRef}
        tabIndex={-1}
      >
        {/* THE DRILL ROW (#1747, DESIGN.md §3.4, board 03): `← Back to <library>` · the name · this tag's
            own verbs — of which a tag has NONE (§3.4 names each collection's set and tags' is empty: Merge
            is a field below because it needs the target picker, Delete is the row's kebab, D121(D)). The
            usage census rides `meta` beside the name it is about — a FACT, not a verb. */}
        <MemberDrillHeader
          back={back}
          meta={
            <Text as="span" voice="datum">
              {usageTotalLabel(tag.usage.total)}
            </Text>
          }
          title={tag.name}
        />

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

        {/* Merge is the editor's one destructive verb (Delete converged onto the row's kebab — #271). It
            stays here because it needs the target picker; the row cannot carry a fold-into-another affordance. */}
        <Row gap="field">
          <TagMergeControl invalidation={invalidation} others={others} tag={tag} trpc={trpc} />
        </Row>
      </Stack>
    </Container>
  );
}

/** The two colour pickers (chip background + text). An empty value maps to `null` (clear to the theme
 *  default) — the tri-state the row-era control already spoke. */
function TagColorControls({ tag, patchStyle }: { readonly tag: TagWithUsage; readonly patchStyle: PatchStyle }): ReactElement {
  // `*:w-auto` — a `<Field>` root is `w-full`, so two of them in a flex row each took HALF the pane and the
  // two 32px swatches ended up 250px apart with nothing between them (side-eye 2026-08-03: the tell that the
  // editor "never got its container"). Intrinsic width puts the pair beside each other, where a pair belongs.
  //
  // …AND EACH ONE SAYS WHAT IT HOLDS (side-eye 2026-08-06 P3). The editor never previews the chip these two
  // values paint, so a cleared colour and a colour set to something the current theme happens to swallow
  // looked identical: two 32px swatches and no words. The VALUE is the cheap honest readout — rather than a
  // preview surface, which would be a second place for the chip to be drawn wrong.
  //
  // IT RIDES THE FIELD'S OWN DESCRIPTION CHANNEL (side-eye 2026-08-08 P2). The first pass hung it as a loose
  // `<Text>` sibling inside the `<Field>`, which paints the words but wires NOTHING: a swatch trigger has no
  // text of its own, so its `aria-describedby` stayed null and the one readout the surface exists to give was
  // invisible to a screen reader — the sibling folder-type Select in this same pane was already doing it the
  // wired way. `description` renders through `BaseField.Description`, which registers its id on the Field's
  // labelable control, so the value IS the button's accessible description. The readout is UNKEYED here
  // (`tagColorValueLabel`); the label 20px above carries the key, and only the list's label-less swatch
  // tooltip still spends `tagColorLabel`'s keyed form.
  return (
    <Row align="start" className="*:w-auto" gap="block">
      <Field description={<TagColorReadout value={tag.color} />} label="Background" name="tag-color">
        <ColorField onValueChange={(value): void => patchStyle({ color: value === "" ? null : value })} value={tag.color ?? ""} />
      </Field>
      <Field description={<TagColorReadout value={tag.color2} />} label="Text" name="tag-color2">
        <ColorField onValueChange={(value): void => patchStyle({ color2: value === "" ? null : value })} value={tag.color2 ?? ""} />
      </Field>
    </Row>
  );
}

/** The colour slot's readout — and its VOICE follows what the words ARE (side-eye 2026-08-08 P3).
 *
 *  Both states rode `voice="datum"`, which is the MONO tabular value voice: right for `#3366aa` (that is a
 *  value, and mono is what makes a column of hexes readable), wrong for "Not set — uses the theme default",
 *  which is a SENTENCE. Prose set in tabular mono reads as machine output — the one voice that says "this
 *  string is data" applied to the one string that is explanation. The unset arm takes `gloss`, the quiet
 *  explanatory sans voice the rest of the editor's descriptions already speak. */
function TagColorReadout({ value }: { readonly value: string | null }): ReactElement {
  return (
    <Text as="span" voice={value === null ? "gloss" : "datum"}>
      {tagColorValueLabel(value)}
    </Text>
  );
}

/** The folder-type Select + the hide-on-card Switch — the tag's DISPLAY behavior, grouped as one concern. */
function TagBehaviorControls({ tag, patchStyle }: { readonly tag: TagWithUsage; readonly patchStyle: PatchStyle }): ReactElement {
  return (
    <Stack gap="block">
      {/* C9-1d: the description says what the value DOES today, including the part that isn't built. An
          Open folder starts expanded in the library's categorized view; a Plain tag still groups, it just
          starts collapsed behind its name + count. Closed's hide-until-you-enter drilldown is deferred by
          ruling (2026-08-09), so the option is named as what it currently is rather than promising
          navigation that does not exist. */}
      <Field
        description="In the library's grouped view, an Open folder starts expanded and a Plain tag starts collapsed behind its name and count. Closed folders (hidden until you enter them) aren't built yet — they behave like Plain."
        label="Folder type"
        name="tag-folder-type"
      >
        {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- #579 source-verified: the label
            lives on the wrapping `<Field label="Folder type">`, not on this `<Select>`, and Select associates
            it at RENDER time through Base UI's FieldRootContext (`BaseField.Control` injects
            `aria-labelledby` — packages/ui/src/primitives/select/select.tsx), never as a literal JSX prop
            here. No `control-has-associated-label` option (labelAttributes/controlComponents/depth) sees a
            context injection — same reason `select-field.tsx`/`switch-field.tsx` stay suppressed. */}
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
