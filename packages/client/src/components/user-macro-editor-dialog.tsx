// The shared User-macro editor Dialog (WAVE MU, §12A.5) — binds `userMacros[index].*` on ANY direct-bind or
// autosave form whose values carry a `userMacros: UserMacroSpec[]` array: name · description · template body ·
// declared args (name/type/optional/default) · typed inputs (#24: kind + per-kind knobs) · per-macro strict.
// The dialog is controlled by its host (open when an index is targeted); closing just drops the local target —
// the variable-editor idiom, no bespoke machinery.
//
// OWNER RULING #20 gave user macros TWO authoring homes — the preset's `promptConfig.userMacros` and a GAME's
// `config.userMacros` — so this anatomy has two consumers (preset's Macros tab, the rpg GM console's Game
// macros section) and lives client-shared, NOT in either feature (a feature-to-feature import is a sideways
// import, and a forked twin would drift from the ONE `UserMacroSpec` schema both write). Same homing as
// `RegexEditorDialog`: client-shared rather than `@orb/ui`, because it composes the form factory's bound
// fields. Generic over the form value shape — both homes hold the array at `userMacros`, so the field paths
// are identical.
//
// A name colliding with a BUILT-IN macro is linted here (registration REFUSES it — never a silent shadow,
// §12A.5); the lint makes the refusal visible at authoring time. A name colliding across the two AUTHORING
// homes is a different rule (the game SHADOWS the preset — it resolves, it is not refused) and is glossed by
// the consumer that knows about the other home, not here.

import type { UserMacroSpec } from "@orb/contracts/preset";
import type { MacroArgType, UserMacroInputKind } from "@orb/kit/macro";
import { createDefaultRegistry, MACRO_ARG_TYPES, USER_MACRO_INPUT_KINDS } from "@orb/kit/macro";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { notify } from "#lib";
import { FormDialog } from "./form-dialog.tsx";

/** The minimal form value shape the dialog binds — any editor form carrying a `userMacros` array. */
export interface UserMacrosFormValues {
  readonly userMacros: UserMacroSpec[];
}

// The form the dialog binds — a direct-bind form OR the autosave factory's reset-less form (the dialog never
// calls `reset`, so it accepts the wider shape; the RegexEditorDialog precedent).
type UserMacroEditorForm = Omit<AppFormInstance<UserMacrosFormValues>, "reset">;

/** One declared arg / one typed input — the schema doesn't export the element types, so derive them. */
type UserMacroArg = UserMacroSpec["args"][number];
type UserMacroInput = UserMacroSpec["inputs"][number];
type UserMacroInputOption = UserMacroInput["options"][number];

/** One input's field-path base — a TEMPLATE-LITERAL type (not `string`) so `${base}.knob` stays inside
 *  the form's typed DeepKeys union. */
type InputBase = `userMacros[${number}].inputs[${number}]`;

// ── the editor's own select vocabularies (WAVE MU) — derived from the kit tuples, never re-spelled ──

const USER_MACRO_INPUT_KIND_LABELS: Record<UserMacroInputKind, string> = {
  "single-select": "Single select — pick one option",
  "boolean-toggle": "Toggle — on/off",
  "multi-select": "Multi select — pick several, joined",
  "random-pick": "Random pick — draw one from your pool each turn",
};
const USER_MACRO_INPUT_KIND_ITEMS: SelectItems<string> = USER_MACRO_INPUT_KINDS.map((value) => ({
  value,
  label: USER_MACRO_INPUT_KIND_LABELS[value],
}));

const MACRO_ARG_TYPE_LABELS: Record<MacroArgType, string> = {
  string: "Text",
  number: "Number",
  boolean: "Boolean",
};
const MACRO_ARG_TYPE_ITEMS: SelectItems<string> = MACRO_ARG_TYPES.map((value) => ({ value, label: MACRO_ARG_TYPE_LABELS[value] }));

// The builtin name set the collision lint checks against — module-level, built once (the same names
// `registerUserMacros` refuses; the lint is the authoring-time mirror of that refusal).
const BUILTIN_REGISTRY = createDefaultRegistry();

export interface UserMacroEditorDialogProps {
  readonly form: UserMacroEditorForm;
  /** The macro index this dialog edits (`userMacros[index].*`). */
  readonly index: number;
  readonly onClose: () => void;
  /**
   * The `{{ }}` completion catalog the template body offers (`withUserMacros(...)` at both call sites — the
   * builtins PLUS the plane this editor's own macro belongs to, so one macro can complete a sibling).
   * Spelled STRUCTURALLY rather than as `@orb/ui/macro-textarea`'s `MacroSuggestion`: that type is re-exported
   * from a browser `.tsx`, and importing it here (even type-only) drags the component into the DOM-LESS type
   * programs that reach this shared module through the `#components` barrel, where it fails for want of
   * lib.dom. This shape is a subset of `MacroSuggestion`, so the hand-off to `MacroField` still typechecks —
   * `insertTemplate` is carried explicitly because dropping it would silently downgrade a block entry
   * (`{{if::}}{{/if}}`) to a bare-call insertion at this one seam.
   */
  readonly suggestions: readonly {
    readonly name: string;
    readonly category?: string;
    readonly description?: string;
    readonly insertTemplate?: string;
  }[];
}

/** The user-macro editor — bound to `userMacros[index].*`; closes via the caller's `onClose`. */
export function UserMacroEditorDialog({ form, index, onClose, suggestions }: UserMacroEditorDialogProps): ReactElement {
  return (
    <FormDialog
      open={true}
      onOpenChange={(next): void => {
        if (!next) {
          onClose();
        }
      }}
      title="Edit macro"
    >
      <Stack gap="block" className="relative min-h-0 overflow-y-auto overscroll-contain">
        <form.AppField name={`userMacros[${index}].name`}>
          {(field): ReactElement => <field.TextField label="Name" description="Called as {{name}} in your prompt. Letters, digits, _ or - only." />}
        </form.AppField>
        <form.Subscribe selector={(state): string => state.values.userMacros[index]?.name ?? ""}>
          {(name): ReactElement | null =>
            BUILTIN_REGISTRY.get(name) !== undefined ? (
              <Text size="micro" tone="warning">
                “{name}” is a built-in macro — user macros never shadow one, so this definition will be refused.
              </Text>
            ) : null
          }
        </form.Subscribe>
        <form.AppField name={`userMacros[${index}].description`}>
          {(field): ReactElement => <field.TextField label="Description" description="One line for the macro browser and autocomplete." />}
        </form.AppField>
        <form.AppField name={`userMacros[${index}].body`}>
          {(field): ReactElement => (
            <field.MacroField
              label="Template"
              description="The body this macro expands to. Reference args and inputs by name ({{argname}}); a block body lands as {{content}}."
              suggestions={suggestions}
              rows={4}
            />
          )}
        </form.AppField>

        <ArgList form={form} index={index} />
        <InputList form={form} index={index} />

        <form.AppField name={`userMacros[${index}].strict`}>
          {(field): ReactElement => (
            <field.SwitchField label="Strict args" description="A call violating the declared args renders empty (never best-effort)." />
          )}
        </form.AppField>

        <Row gap="field" justify="end">
          <DialogClose render={<Button intent="primary">Done</Button>} />
        </Row>
      </Stack>
    </FormDialog>
  );
}

/** A fresh declared arg (schema defaults). */
function makeArg(): UserMacroArg {
  return { name: "arg", type: "string", optional: false };
}

/** The declared-args list — the SAME arg contract builtins declare; enforced at render by checkMacroArgs. */
function ArgList({ form, index }: { readonly form: UserMacroEditorForm; readonly index: number }): ReactElement {
  const argsName = `userMacros[${index}].args` as const;
  return (
    <Section heading="Arguments">
      <Text size="micro" tone="muted">
        Positional args a call passes ({"{{name::a::b}}"}) — each binds by name inside the template. Optional args must come last.
      </Text>
      <form.Subscribe selector={(state): readonly UserMacroArg[] => state.values.userMacros[index]?.args ?? []}>
        {(args): ReactElement => (
          <Stack gap="field">
            {args.map((_arg, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: args are a positional, id-less list edited in place by index — the index IS the identity.
              <Row key={j} gap="field" align="end">
                <form.AppField name={`userMacros[${index}].args[${j}].name`}>{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>
                <form.AppField name={`userMacros[${index}].args[${j}].type`}>
                  {(field): ReactElement => <field.SelectField label="Type" items={MACRO_ARG_TYPE_ITEMS} />}
                </form.AppField>
                <form.AppField name={`userMacros[${index}].args[${j}].optional`}>
                  {(field): ReactElement => <field.SwitchField label="Optional" />}
                </form.AppField>
                <form.AppField name={`userMacros[${index}].args[${j}].default`}>{(field): ReactElement => <field.TextField label="Default" />}</form.AppField>
                <Button
                  intent="ghost"
                  size="sm"
                  onClick={(): void => {
                    form.removeFieldValue(argsName, j).catch(() => notify.error("Couldn't update the macro."));
                  }}
                >
                  Remove
                </Button>
              </Row>
            ))}
            <Row>
              <Button
                intent="secondary"
                size="sm"
                onClick={(): void => {
                  form.pushFieldValue(argsName, makeArg());
                }}
              >
                <Icon icon={Plus} size="sm" />
                Add argument
              </Button>
            </Row>
          </Stack>
        )}
      </form.Subscribe>
    </Section>
  );
}

/** A fresh typed input (schema defaults; single-select with one blank option so the editor has a row). */
function makeInput(): UserMacroInput {
  return {
    kind: "single-select",
    name: "input",
    label: "",
    options: [{ label: "Option", value: "" }],
    separator: ", ",
    onValue: "true",
    offValue: "",
    defaultValue: "",
  };
}

/** The typed-inputs list (#24) — each input is a per-user, per-turn control; the kind picks the knobs. */
function InputList({ form, index }: { readonly form: UserMacroEditorForm; readonly index: number }): ReactElement {
  const inputsName = `userMacros[${index}].inputs` as const;
  return (
    <Section heading="Inputs">
      <Text size="micro" tone="muted">
        Typed controls each user answers per turn — the pick binds by name inside the template. Random pick draws one from the selected pool every generation
        (swipes replay the same draw).
      </Text>
      <form.Subscribe selector={(state): readonly UserMacroInput[] => state.values.userMacros[index]?.inputs ?? []}>
        {(inputs): ReactElement => (
          <Stack gap="field">
            {inputs.map((input, j) => (
              <InputEditor
                // biome-ignore lint/suspicious/noArrayIndexKey: inputs are a positional, id-less list edited in place by index — the index IS the identity.
                key={j}
                form={form}
                macroIndex={index}
                inputIndex={j}
                kind={input.kind}
                onRemove={(): void => void form.removeFieldValue(inputsName, j)}
              />
            ))}
            <Row>
              <Button
                intent="secondary"
                size="sm"
                onClick={(): void => {
                  form.pushFieldValue(inputsName, makeInput());
                }}
              >
                <Icon icon={Plus} size="sm" />
                Add input
              </Button>
            </Row>
          </Stack>
        )}
      </form.Subscribe>
    </Section>
  );
}

/** One input's editor row-group: kind + name + label, then the kind's own knobs. */
function InputEditor({
  form,
  macroIndex,
  inputIndex,
  kind,
  onRemove,
}: {
  readonly form: UserMacroEditorForm;
  readonly macroIndex: number;
  readonly inputIndex: number;
  readonly kind: UserMacroInput["kind"];
  readonly onRemove: () => void;
}): ReactElement {
  const base = `userMacros[${macroIndex}].inputs[${inputIndex}]` as const;
  const hasOptions = kind !== "boolean-toggle";
  return (
    <Stack gap="field" padding="field" className="rounded-base border border-border bg-card">
      <Row gap="field" align="end" justify="between">
        <form.AppField name={`${base}.kind`}>{(field): ReactElement => <field.SelectField label="Kind" items={USER_MACRO_INPUT_KIND_ITEMS} />}</form.AppField>
        <Button intent="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </Row>
      <Row gap="field" align="end">
        <form.AppField name={`${base}.name`}>
          {(field): ReactElement => <field.TextField label="Name" description="Bound as {{name}} in the template." />}
        </form.AppField>
        <form.AppField name={`${base}.label`}>
          {(field): ReactElement => <field.TextField label="Question" description="What the user is asked." />}
        </form.AppField>
      </Row>
      {hasOptions ? <InputOptionList form={form} base={base} macroIndex={macroIndex} inputIndex={inputIndex} /> : null}
      <InputKindKnobs form={form} base={base} kind={kind} />
    </Stack>
  );
}

/** The kind-specific knobs — irrelevant knobs stay stored (the flat schema) but aren't shown. */
function InputKindKnobs({
  form,
  base,
  kind,
}: {
  readonly form: UserMacroEditorForm;
  readonly base: InputBase;
  readonly kind: UserMacroInput["kind"];
}): ReactElement | null {
  if (kind === "boolean-toggle") {
    return (
      <Row gap="field" align="end">
        <form.AppField name={`${base}.onValue`}>{(field): ReactElement => <field.TextField label="On value" />}</form.AppField>
        <form.AppField name={`${base}.offValue`}>{(field): ReactElement => <field.TextField label="Off value" />}</form.AppField>
        <form.AppField name={`${base}.defaultValue`}>
          {(field): ReactElement => <field.TextField label="Default" description="on/true/1 starts on; anything else starts off." />}
        </form.AppField>
      </Row>
    );
  }
  if (kind === "multi-select") {
    return (
      <Row gap="field" align="end">
        <form.AppField name={`${base}.separator`}>
          {(field): ReactElement => <field.TextField label="Separator" description="Joins the picks." />}
        </form.AppField>
        <form.AppField name={`${base}.defaultValue`}>
          {(field): ReactElement => <field.TextField label="Default" description="Used when the user picks nothing (already joined)." />}
        </form.AppField>
      </Row>
    );
  }
  if (kind === "single-select") {
    return (
      <form.AppField name={`${base}.defaultValue`}>
        {(field): ReactElement => <field.TextField label="Default value" description="Used when the user skips the question (blank = first option)." />}
      </form.AppField>
    );
  }
  // random-pick: the pool IS the options — the user's per-turn selection narrows it; no extra knobs.
  return null;
}

/** The nested option list — label/value pairs at `userMacros[i].inputs[j].options[k].*`. */
function InputOptionList({
  form,
  base,
  macroIndex,
  inputIndex,
}: {
  readonly form: UserMacroEditorForm;
  readonly base: InputBase;
  readonly macroIndex: number;
  readonly inputIndex: number;
}): ReactElement {
  const optionsName = `${base}.options` as const;
  return (
    <form.Subscribe selector={(state): readonly UserMacroInputOption[] => state.values.userMacros[macroIndex]?.inputs[inputIndex]?.options ?? []}>
      {(options): ReactElement => (
        <Stack gap="field">
          {options.map((_option, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: options are a positional, id-less list edited in place by index — the index IS the identity.
            <Row key={k} gap="field" align="end">
              <form.AppField name={`${base}.options[${k}].label`}>{(field): ReactElement => <field.TextField label="Label" />}</form.AppField>
              <form.AppField name={`${base}.options[${k}].value`}>{(field): ReactElement => <field.TextField label="Value" />}</form.AppField>
              <Button
                intent="ghost"
                size="sm"
                onClick={(): void => {
                  form.removeFieldValue(optionsName, k).catch(() => notify.error("Couldn't update the macro."));
                }}
              >
                Remove
              </Button>
            </Row>
          ))}
          <Row>
            <Button
              intent="secondary"
              size="sm"
              onClick={(): void => {
                form.pushFieldValue(optionsName, { label: "Option", value: "" });
              }}
            >
              <Icon icon={Plus} size="sm" />
              Add option
            </Button>
          </Row>
        </Stack>
      )}
    </form.Subscribe>
  );
}
