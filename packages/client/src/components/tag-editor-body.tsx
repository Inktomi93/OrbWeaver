// One immediate-commit tag editor, shared by Corpus Labels and chip popovers.
import type { TagWithUsage, UpdateTagInput } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ColorField } from "@orb/ui/color-field";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { Invalidation, Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { setLabelNameFocus, useLabelNameFocus } from "#state";
import { FOLDER_TYPE_ITEMS, tagColorValueLabel, tagUsageLabel } from "../lib/tag-model.ts";
import { FormDialog } from "./form-dialog.tsx";
import type { MemberDrillBack } from "./member-drill-header.tsx";
import { MemberDrillHeader } from "./member-drill-header.tsx";
import { SettingSwitchRow } from "./setting-switch-row.tsx";
import { useMergeTags, useRenameTag, useUpdateTagStyle } from "./tag-mutations.ts";

/** Apply a partial patch to this tag (the immediate-commit style writer the sub-controls share). */
type PatchStyle = (patch: UpdateTagInput) => void;

export function TagEditorBody({
  tag,
  others,
  back,
  onMerged,
}: {
  readonly tag: TagWithUsage;
  readonly others: readonly TagWithUsage[];
  readonly back?: MemberDrillBack;
  readonly onMerged: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const deps = { trpc, invalidation };
  const rename = useRenameTag(deps);
  const style = useUpdateTagStyle(deps);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  // A just-created tag opens on its Name field instead of the editor root, once.
  const nameRef = useRef<HTMLInputElement>(null);
  const nameFocus = useLabelNameFocus();
  useEffect(() => {
    if (nameFocus !== tag.id) {
      return;
    }
    // Selected, so the first keystroke replaces the placeholder name instead of appending to it.
    nameRef.current?.focus();
    nameRef.current?.select();
    setLabelNameFocus(null);
  }, [nameFocus, tag.id]);
  const [name, setName] = useState(tag.name);
  const [savedName, setSavedName] = useState(tag.name);
  if (savedName !== tag.name) {
    setSavedName(tag.name);
    setName(tag.name);
  }

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
      {/* `--width-content-col` — the ruled cap for an EDITOR's content column, not a reading measure. This
          block holds controls, and the prose token's own contract forbids it here: a `ch` resolves in the
          element's own font, so a measure inherited from a wrapper reads at the wrong scale.

          THE TOKEN'S STATED CONSUMPTION IS THREE CLASSES, NOT ONE. `--width-content-col`'s own
          `$description` says the column is CENTERED and BREATHES to `--width-content-col-wide` once its
          container clears `@5xl`; the bare cap alone left-pins the editor and leaves the rest of the pane
          dead. The `@5xl` arm is reached whenever both side panels are collapsed on a desktop. The query
          container is the `<Container>` directly above, which is why the cap and the container are two
          elements. `w-full` rides with `mx-auto` because the pane is a flex column. */}
      <Stack
        className="mx-auto min-w-0 w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide) outline-none"
        data-slot="tag-member-editor"
        gap="block"
        ref={surfaceRef}
        tabIndex={-1}
      >
        {/* THE DRILL ROW (the mock design §3.4): `← Back to <library>` · the name · this tag's
            own verbs — of which a tag has NONE (§3.4 names each collection's set and tags' is empty: Merge
            is a field below because it needs the target picker, Delete is the row's kebab, D212). The
            usage census rides `meta` beside the name it is about — a FACT, not a verb. */}
        {back === undefined ? (
          <Heading className="min-w-0 truncate" level={2}>
            {tag.name}
          </Heading>
        ) : (
          <MemberDrillHeader
            back={back}
            meta={
              <Text as="span" voice="datum">
                {tagUsageLabel(tag)}
              </Text>
            }
            title={tag.name}
          />
        )}

        <Field label="Name" name="tag-name">
          <Input
            onBlur={commitName}
            onKeyDown={(event): void => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            onValueChange={setName}
            ref={nameRef}
            value={name}
          />
        </Field>

        <TagColorControls patchStyle={patchStyle} tag={tag} />
        <TagBehaviorControls patchStyle={patchStyle} tag={tag} />

        {/* Merge is the editor's one destructive verb (Delete lives on the row's kebab, D212). It
            stays here because it needs the target picker; the row cannot carry a fold-into-another affordance. */}
        <Row gap="field">
          <TagMergeControl invalidation={invalidation} others={others} tag={tag} trpc={trpc} onMerged={onMerged} />
        </Row>
      </Stack>
    </Container>
  );
}

/** The two colour pickers (chip background + text). An empty value maps to `null` (clear to the theme
 *  default) — the tri-state the row-era control already spoke. */
function TagColorControls({ tag, patchStyle }: { readonly tag: TagWithUsage; readonly patchStyle: PatchStyle }): ReactElement {
  // `*:w-auto` — a `<Field>` root is `w-full`, so two of them in a flex row each take HALF the pane and the
  // two swatches end up far apart with nothing between them. Intrinsic width puts the pair beside each other.
  //
  // …AND EACH ONE SAYS WHAT IT HOLDS. The editor never previews the chip these two values paint, so without
  // words a cleared colour and a colour the current theme happens to swallow look identical. The VALUE is the
  // cheap honest readout — a preview surface would be a second place for the chip to be drawn wrong.
  //
  // IT RIDES THE FIELD'S OWN DESCRIPTION CHANNEL. A swatch trigger has no text of its own, so a loose `<Text>`
  // sibling would paint the words and wire nothing. `description` renders through `BaseField.Description`,
  // which registers its id on the Field's labelable control, so the value IS the button's accessible
  // description. The readout is UNKEYED here (`tagColorValueLabel`); the label above carries the key.
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

/** The colour slot's readout — and its VOICE follows what the words ARE.
 *
 *  A hex value takes `datum`, the MONO tabular value voice that makes a column of hexes readable. "Not set —
 *  uses the theme default" is a SENTENCE, and prose set in tabular mono reads as machine output, so the unset
 *  arm takes `gloss`, the quiet explanatory voice the rest of the editor's descriptions speak. */
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
      {/* The description says what the value DOES today, including the part that isn't built. An
          Open folder starts expanded in the library's categorized view; a Plain tag still groups, it just
          starts collapsed behind its name + count. Closed's hide-until-you-enter drilldown is deferred by
          ruling, so the option is named as what it currently is rather than promising
          navigation that does not exist. */}
      <Field
        description="In the library's grouped view, an Open folder starts expanded and a Plain tag starts collapsed behind its name and count. Closed folders (hidden until you enter them) aren't built yet — they behave like Plain."
        label="Folder type"
        name="tag-folder-type"
      >
        {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- the label
            lives on the wrapping `<Field label="Folder type">`, not on this `<Select>`, and Select associates
            it at RENDER time through Base UI's FieldRootContext (`BaseField.Control` injects
            `aria-labelledby` — packages/ui/src/primitives/select/select.tsx), never as a literal JSX prop
            here. No `control-has-associated-label` option (labelAttributes/controlComponents/depth) sees a
            context injection — the same reason `select-field.tsx` stays suppressed. */}
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
      {/* THE ONE SWITCH ROW, FACING THE HOUSE DIRECTION. `SettingSwitchRow` is the ruled row (label left,
          control right, `Field orientation="horizontal"`), so this form keeps one control orientation. Its
          label is a real `<label>`, so clicking the sentence focuses the switch like every other row in the
          pane; Base UI's `Field` mints the association from context, which is why no id is passed. The
          explanation is the `description` — the `aria-describedby`-wired, reading-measure-capped slot — so
          the label is the switch's NAME. The name omits the tag's own word because the drill header above
          already states it. */}
      <SettingSwitchRow
        checked={tag.isHiddenOnCard}
        description="It still filters."
        label="Hide chip on cards"
        onChange={(next): void => patchStyle({ isHiddenOnCard: next })}
      />
    </Stack>
  );
}

/** "Merge into…" — folds this tag into another (mergeTags), then deletes it. */
function TagMergeControl({
  tag,
  others,
  trpc,
  invalidation,
  onMerged,
}: {
  readonly tag: TagWithUsage;
  readonly others: readonly TagWithUsage[];
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly onMerged: () => void;
}): ReactElement {
  const merge = useMergeTags({ trpc, invalidation });
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<TagId | null>(null);

  const confirmMerge = (): void => {
    if (target === null) {
      return;
    }
    merge.mutate(
      { sourceTagId: tag.id, targetTagId: target },
      {
        onSuccess: (): void => {
          setOpen(false);
          setTarget(null);
          onMerged();
        },
      },
    );
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
