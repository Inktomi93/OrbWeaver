// One immediate-commit tag editor, shared by Corpus Labels and chip popovers.
// Merge confirms inline: a body-portaled modal sits below its owning chip popover in the ruled overlay stack.
import type { TagView, TagWithUsage } from "@orb/contracts/tag";
import { createTagSchema } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { normalizeTagName } from "@orb/kit/tag";
import { Button } from "@orb/ui/button";
import { ColorField } from "@orb/ui/color-field";
import { Field } from "@orb/ui/field";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { AutosaveStatus, createAutosaveEntityForm, touchedFieldError } from "#forms/editor";
import { useFocusOnMount } from "#lib";
import { setLabelNameFocus, useLabelNameFocus } from "#state";
import { FOLDER_TYPE_ITEMS, tagColorValueLabel, tagUsageLabel } from "../lib/tag-model.ts";
import type { MemberDrillBack } from "./member-drill-header.tsx";
import { MemberDrillHeader } from "./member-drill-header.tsx";
import { SettingSwitchRow } from "./setting-switch-row.tsx";
import { useMergeTags, useUpdateTag } from "./tag-mutations.ts";

type TagEditorValues = Pick<TagView, "name" | "color" | "color2" | "folderType" | "isHiddenOnCard">;

function tagEditorValues(tag: TagView): TagEditorValues {
  return { name: tag.name, color: tag.color, color2: tag.color2, folderType: tag.folderType, isHiddenOnCard: tag.isHiddenOnCard };
}

function tagEditorPatch(values: TagEditorValues): TagEditorValues {
  return { ...values, name: normalizeTagName(values.name) };
}

const TagForm = createAutosaveEntityForm<TagEditorValues>({
  defaultValues: { name: "", color: null, color2: null, folderType: "NONE", isHiddenOnCard: false },
  canonicalValues: tagEditorPatch,
  options: {
    validators: {
      onDynamic: ({ value }: { value: TagEditorValues }) => {
        const parsed = createTagSchema.shape.name.safeParse(normalizeTagName(value.name));
        return parsed.success ? undefined : { fields: { name: parsed.error.issues.map((issue) => issue.message).join(", ") } };
      },
    },
  },
});

interface TagEditorBodyProps {
  readonly tag: TagWithUsage;
  readonly others: readonly TagWithUsage[];
  readonly back?: MemberDrillBack;
  readonly onMerged: () => void;
}

interface TagWriteTransaction {
  readonly tagId: TagId;
  readonly settle: Promise<void>;
}

export function TagEditorBody(props: TagEditorBodyProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateTag({ trpc, invalidation });
  const merge = useMergeTags({ trpc, invalidation });
  const writes = useRef(new Map<TagId, Set<Promise<void>>>());
  const merges = useRef<TagWriteTransaction | null>(null);
  const [confirmed, setConfirmed] = useState<TagView | null>(null);
  const save = async (values: TagEditorValues): Promise<void> => {
    const merging = merges.current;
    if (merging?.tagId === props.tag.id) {
      try {
        await merging.settle;
        return;
      } catch {
        // Merge's mutation owns the failure; the surviving source still needs this ordinary save, even after dismissal.
      }
    }
    const writing = update.mutateAsync({ tagId: props.tag.id, patch: tagEditorPatch(values) }).then((row): void => setConfirmed(row));
    const pending = writes.current.get(props.tag.id) ?? new Set<Promise<void>>();
    pending.add(writing);
    writes.current.set(props.tag.id, pending);
    try {
      await writing;
    } finally {
      pending.delete(writing);
      if (pending.size === 0) {
        writes.current.delete(props.tag.id);
      }
    }
  };
  const mergeInto = async (targetTagId: TagId): Promise<void> => {
    const current = merges.current;
    if (current?.tagId === props.tag.id) {
      return current.settle;
    }
    const pending = [...(writes.current.get(props.tag.id) ?? [])];
    const merging = {
      tagId: props.tag.id,
      settle: (async (): Promise<void> => {
        // Deletion waits for dispatched writes, including failed ones; their form lifecycle owns the failure.
        await Promise.allSettled(pending);
        await merge.mutateAsync({ sourceTagId: props.tag.id, targetTagId });
      })(),
    };
    merges.current = merging;
    try {
      await merging.settle;
    } catch (error) {
      if (merges.current === merging) {
        merges.current = null;
      }
      throw error;
    }
  };
  return (
    <TagForm entityId={props.tag.id} serverValues={tagEditorValues(props.tag)} save={save}>
      {(session): ReactElement => <TagEditorFields {...props} confirmed={confirmed} mergeInto={mergeInto} merging={merge.isPending} session={session} />}
    </TagForm>
  );
}

interface TagEditorFieldsProps extends TagEditorBodyProps {
  readonly session: AutosaveSession<TagEditorValues>;
  readonly confirmed: TagView | null;
  readonly mergeInto: (targetTagId: TagId) => Promise<void>;
  readonly merging: boolean;
}

function TagEditorFields({ tag, others, back, onMerged, session, confirmed, mergeInto, merging }: TagEditorFieldsProps): ReactElement {
  const { form } = session;
  useEffect(() => {
    const currentName = form.state.values.name;
    if (confirmed?.id === tag.id && normalizeTagName(currentName) === confirmed.name && currentName !== confirmed.name) {
      // The response may precede or follow its bus echo; never replace a newer, semantically different edit.
      form.setFieldValue("name", confirmed.name, { dontUpdateMeta: true });
    }
  }, [confirmed, form, tag.id]);
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
        focusTarget={true}
        className="mx-auto inline-full max-inline-(--width-content-col) min-inline-0 @cq-64:max-inline-(--width-content-col-wide)"
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
          <Heading className="truncate min-inline-0" level={2}>
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

        <AutosaveStatus state={session.saveState} onRetry={session.retrySave} />
        <form.AppField name="name">
          {(field): ReactElement => (
            <Field error={touchedFieldError(field.state.meta)} label="Name" name="tag-name">
              <Input
                onBlur={field.handleBlur}
                onKeyDown={(event): void => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                onValueChange={field.handleChange}
                ref={nameRef}
                value={field.state.value}
              />
            </Field>
          )}
        </form.AppField>

        <TagColorControls form={form} />
        <TagBehaviorControls form={form} />

        {/* Merge is the editor's one destructive verb (Delete lives on the row's kebab, D212). It
            stays here because it needs the target picker; the row cannot carry a fold-into-another affordance. */}
        <Row gap="field">
          <TagMergeControl others={others} tag={tag} mergeInto={mergeInto} merging={merging} onMerged={onMerged} />
        </Row>
      </Stack>
    </Container>
  );
}

/** The two colour pickers (chip background + text). An empty value maps to `null` (clear to the theme
 *  default) — the tri-state the row-era control already spoke. */
function TagColorControls({ form }: { readonly form: AutosaveSession<TagEditorValues>["form"] }): ReactElement {
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
    <Row align="start" className="*:inline-auto" gap="block">
      <form.AppField name="color">
        {(field): ReactElement => (
          <Field description={<TagColorReadout value={field.state.value} />} label="Background" name="tag-color">
            <ColorField onValueChange={(value): void => field.handleChange(value === "" ? null : value)} value={field.state.value ?? ""} />
          </Field>
        )}
      </form.AppField>
      <form.AppField name="color2">
        {(field): ReactElement => (
          <Field description={<TagColorReadout value={field.state.value} />} label="Text" name="tag-color2">
            <ColorField onValueChange={(value): void => field.handleChange(value === "" ? null : value)} value={field.state.value ?? ""} />
          </Field>
        )}
      </form.AppField>
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
function TagBehaviorControls({ form }: { readonly form: AutosaveSession<TagEditorValues>["form"] }): ReactElement {
  return (
    <Stack gap="block">
      {/* The description says what the value DOES today, including the part that isn't built. An
          Open folder starts expanded in the library's categorized view; a Plain tag still groups, it just
          starts collapsed behind its name + count. Closed's hide-until-you-enter drilldown is deferred by
          ruling, so the option is named as what it currently is rather than promising
          navigation that does not exist. */}
      <form.AppField name="folderType">
        {(field): ReactElement => (
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
                  field.handleChange(value);
                }
              }}
              value={field.state.value}
            />
          </Field>
        )}
      </form.AppField>
      {/* THE ONE SWITCH ROW, FACING THE HOUSE DIRECTION. `SettingSwitchRow` is the ruled row (label left,
          control right, `Field orientation="horizontal"`), so this form keeps one control orientation. Its
          label is a real `<label>`, so clicking the sentence focuses the switch like every other row in the
          pane; Base UI's `Field` mints the association from context, which is why no id is passed. The
          explanation is the `description` — the `aria-describedby`-wired, reading-measure-capped slot — so
          the label is the switch's NAME. The name omits the tag's own word because the drill header above
          already states it. */}
      <form.AppField name="isHiddenOnCard">
        {(field): ReactElement => (
          <SettingSwitchRow checked={field.state.value} description="It still filters." label="Hide chip on cards" onChange={field.handleChange} />
        )}
      </form.AppField>
    </Stack>
  );
}

/** "Merge into…" — folds this tag into another (mergeTags), then deletes it. */
function TagMergeControl({
  tag,
  others,
  mergeInto,
  merging,
  onMerged,
}: {
  readonly tag: TagWithUsage;
  readonly others: readonly TagWithUsage[];
  readonly mergeInto: (targetTagId: TagId) => Promise<void>;
  readonly merging: boolean;
  readonly onMerged: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<TagId | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef<HTMLButtonElement>(null);
  const cancel = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  useEffect(() => {
    if (open) {
      targetRef.current?.focus();
    }
  }, [open]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  const confirmMerge = (): void => {
    if (target === null) {
      return;
    }
    void mergeInto(target)
      .then((): void => {
        if (!mounted.current) {
          return;
        }
        setOpen(false);
        setTarget(null);
        onMerged();
      })
      // The mutation's error toast owns merge refusal; the open confirmation and form draft remain available.
      .catch(() => undefined);
  };

  return (
    <Stack gap="field">
      <Button
        ref={triggerRef}
        aria-expanded={open}
        disabled={others.length === 0}
        intent="secondary"
        onClick={(): void => setOpen(true)}
        size="sm"
        type="button"
      >
        Merge into…
      </Button>
      {open ? (
        <Fieldset
          onKeyDown={(event): void => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancel();
            }
          }}
        >
          <FieldsetLegend>{`Merge "${tag.name}" into another tag`}</FieldsetLegend>
          <Text voice="gloss">Every attachment moves to the tag you pick, then this tag is deleted. This can't be undone.</Text>
          <Select
            triggerRef={targetRef}
            aria-label="Merge target tag"
            items={others.map((other) => ({ label: other.name, value: other.id }))}
            onValueChange={(value: TagId | null): void => setTarget(value)}
            placeholder="Choose a tag…"
            value={target}
          />
          <Row gap="field">
            <Button intent="ghost" onClick={cancel} type="button">
              Cancel
            </Button>
            <Button intent="destructive" disabled={target === null || merging} loading={merging} onClick={confirmMerge} type="button">
              Merge
            </Button>
          </Row>
        </Fieldset>
      ) : null}
    </Stack>
  );
}
