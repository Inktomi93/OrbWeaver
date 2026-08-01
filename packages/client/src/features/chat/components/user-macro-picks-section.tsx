// The PICKS pane (#24) — ONE client pane, TWO knob families (the user-macro delivery spec's shared-pane
// ruling). A preset author declares knobs the ROOM answers, in two vocabularies, and this section is where
// the room answers them:
//   • ChoiceBlock VARIABLES — a flat `{{name}}` → picked value map (`chat.getVariablePicks` +
//     `chat.setVariables`, `chats.variableValues`).
//   • user-macro INPUTS — a macro (`{{mood}}`) with typed inputs (a Tone select, a random-pick pool, …)
//     (`chat.getUserMacroPicks` + `chat.setUserMacroValues`, `chats.user_macro_values`).
// Both halves read declarations + the stored bag in ONE proc each and write the WHOLE rebuilt bag on every
// edit — each verb is a column flush, so there is no per-knob patch verb to reach for. (The module keeps its
// MU name because the section, its CT mirror and its story are named for the family that landed first.)
//
// PER-CHAT, not per-user (the MU spec's Arm-A owner ruling): the picks are room state every member shares and
// every member may edit (the `setVariables` member floor), so the copy says "this chat", never "yours".
//
// UNSET IS A REAL STATE, rendered as one (empty-states doctrine). A knob with no stored pick resolves its
// declared default at turn time (`resolveUserMacroInputs` / `resolveChoiceVariables` — the ONE resolution home
// per family) — so every control offers an explicit "Use default" and says what the default resolves TO,
// instead of silently showing the fallback as if it had been chosen. The select-family carries that as a first
// item; the user-macro checkbox-family (a stored pick is an ARRAY, which no checkbox can un-pick back to
// absent) carries it as a "Use default" button. A ChoiceBlock multi-select needs no such button: its store is
// ONE joined string and the resolver reads `""` as unpicked, so unchecking everything IS the unset.
//
// Discrete-write control OUTSIDE an autosave form ⇒ OPTIMISTIC (the `setChatBackground` precedent): the pick
// must paint before the round trip, and the `chatUpdated` bus echo is the reconciliation.

import type { ChoiceBlockSpec, ChoiceBlockValues, UserMacroValues } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import type { UserMacroInputDef } from "@orb/kit/macro";
import { userMacroToggleDefaultsOn } from "@orb/kit/macro";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Heading, Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { SettingCheckboxRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useSetUserMacroValues, useSetVariables } from "../hooks/use-context-panel-mutations";

/** ONE stored pick, DERIVED from the wire bag (never re-spelled): string | boolean | string[]. Kit's
 *  `UserMacroInputValue` is the same union with a READONLY array arm — the bag we send is the mutable
 *  contracts shape, so the editors build against that one. */
type PickValue = UserMacroValues[string][string];

/** The select-family's explicit "no pick stored" item value. A sentinel (not `""`) because an authored option
 *  value MAY legitimately be the empty string. */
const UNSET = "__unset__";

/** What an UNPICKED input resolves to at turn time — the `resolveUserMacroInputs` per-kind table, said in
 *  words. Rendering the fallback in the control itself would lie (it would look chosen); this names it. */
function unsetSummary(input: UserMacroInputDef): string {
  if (input.kind === "single-select") {
    const fallback = input.defaultValue.length > 0 ? input.defaultValue : (input.options[0]?.value ?? "");
    return fallback.length > 0 ? `Use default (${fallback})` : "Use default (nothing)";
  }
  if (input.kind === "boolean-toggle") {
    return `Use default (${userMacroToggleDefaultsOn(input.defaultValue) ? "on" : "off"})`;
  }
  if (input.kind === "multi-select") {
    return input.defaultValue.length > 0 ? `Use default (${input.defaultValue})` : "Use default (nothing)";
  }
  return `Use default (draws from all ${input.options.length} options each reply)`;
}

/** The stored pick for one input, or `undefined` when unset. */
function pickOf(values: UserMacroValues, macro: string, input: string): PickValue | undefined {
  return values[macro]?.[input];
}

/** Rebuild the whole bag with ONE input set (or, for `next === undefined`, unset). An emptied macro entry is
 *  dropped entirely so "unset everything" round-trips to `{}` — the same shape a never-picked chat has. */
function withPick(values: UserMacroValues, macro: string, input: string, next: PickValue | undefined): UserMacroValues {
  const bag: Record<string, PickValue> = { ...values[macro] };
  if (next === undefined) {
    delete bag[input];
  } else {
    bag[input] = next;
  }
  const rest = { ...values };
  delete rest[macro];
  return Object.keys(bag).length === 0 ? rest : { ...rest, [macro]: bag };
}

interface InputControlProps {
  readonly input: UserMacroInputDef;
  readonly value: PickValue | undefined;
  readonly onPick: (next: PickValue | undefined) => void;
}

/** single-select — the authored options plus the leading "Use default" item (the unset arm). */
function SingleSelectControl({ input, value, onPick }: InputControlProps): ReactElement {
  const label = input.label.length > 0 ? input.label : input.name;
  const items = [{ label: unsetSummary(input), value: UNSET }, ...input.options.map((option) => ({ label: option.label, value: option.value }))];
  return (
    <Field label={label}>
      <Select
        aria-label={label}
        items={items}
        value={typeof value === "string" ? value : UNSET}
        onValueChange={(next: string | null): void => onPick(next === UNSET || next === null ? undefined : next)}
      />
    </Field>
  );
}

/** boolean-toggle — THREE states, not a switch: a switch cannot express "unpicked, follow the author's
 *  default", and the default's polarity is the author's (`defaultValue` truthiness), not ours. */
function BooleanToggleControl({ input, value, onPick }: InputControlProps): ReactElement {
  const label = input.label.length > 0 ? input.label : input.name;
  const items = [
    { label: unsetSummary(input), value: UNSET },
    { label: `On (${input.onValue.length > 0 ? input.onValue : "empty"})`, value: "on" },
    { label: `Off (${input.offValue.length > 0 ? input.offValue : "empty"})`, value: "off" },
  ];
  let current = UNSET;
  if (typeof value === "boolean") {
    current = value ? "on" : "off";
  }
  return (
    <Field label={label}>
      <Select
        aria-label={label}
        items={items}
        value={current}
        onValueChange={(next: string | null): void => onPick(next === UNSET || next === null ? undefined : next === "on")}
      />
    </Field>
  );
}

/** multi-select + random-pick — both store a STRING ARRAY, so both are a checkbox set. The kinds differ only
 *  in what the turn does with it: multi-select joins the picks, random-pick draws ONE from them per reply
 *  (unpicked ⇒ the pool is every option). An explicit `[]` is a real multi-select pick ("none"), which is why
 *  unsetting needs its own affordance rather than "uncheck everything". */
function ArrayPickControl({ input, value, onPick }: InputControlProps): ReactElement {
  const label = input.label.length > 0 ? input.label : input.name;
  const rowId = useId();
  const picked: readonly string[] = Array.isArray(value) ? value : [];
  const isSet = Array.isArray(value);
  // What the CURRENT state does at turn time — the set arm differs by kind (join vs draw), the unset arm is
  // the shared per-kind default summary.
  let consequence = unsetSummary(input);
  if (isSet) {
    consequence = input.kind === "random-pick" ? "Draws one of the checked options each reply." : "The checked options, joined.";
  }
  const toggle = (optionValue: string, checked: boolean): void => {
    onPick(checked ? [...picked, optionValue] : picked.filter((v) => v !== optionValue));
  };
  return (
    <Fieldset>
      <FieldsetLegend>{label}</FieldsetLegend>
      <Stack gap="field">
        {input.options.map((option) => (
          <SettingCheckboxRow
            key={option.value}
            id={`${rowId}-${option.value}`}
            label={option.label}
            checked={picked.includes(option.value)}
            onChange={(checked): void => toggle(option.value, checked)}
          />
        ))}
        <Row gap="field" align="center" justify="between">
          <Text size="micro" tone="muted">
            {consequence}
          </Text>
          {isSet ? (
            <Button intent="ghost" size="sm" type="button" onClick={(): void => onPick(undefined)}>
              Use default
            </Button>
          ) : null}
        </Row>
      </Stack>
    </Fieldset>
  );
}

function InputControl(props: InputControlProps): ReactElement {
  if (props.input.kind === "single-select") {
    return <SingleSelectControl {...props} />;
  }
  if (props.input.kind === "boolean-toggle") {
    return <BooleanToggleControl {...props} />;
  }
  return <ArrayPickControl {...props} />;
}

// ── The ChoiceBlock family ────────────────────────────────────────────────────────────────────────────
// A ChoiceBlock stores ONE string per variable, so its editors differ from the macro-input ones above in two
// ways: a multi-select pick is its values `separator`-JOINED (never an array), and `""` is indistinguishable
// from absent (`resolveChoiceVariables` falls back on both) — so "unset" is simply "no key".

/** What an UNPICKED variable resolves to at turn time — `resolveChoiceVariables`' fallback ladder
 *  (`defaultValue` → the first option → nothing), said in words. */
function variableUnsetSummary(spec: ChoiceBlockSpec): string {
  const fallback = spec.defaultValue ?? spec.options[0]?.value ?? "";
  if (fallback.length === 0) {
    return "Use default (nothing)";
  }
  return spec.multiSelect && spec.randomPick ? `Use default (${fallback}) — one part drawn each reply` : `Use default (${fallback})`;
}

interface VariableControlProps {
  readonly spec: ChoiceBlockSpec;
  readonly value: string | undefined;
  readonly onPick: (next: string | undefined) => void;
}

/** A single-pick variable — the authored options plus the leading "Use default" item (the unset arm). A
 *  stored value the preset no longer offers (the author edited the options after the room picked) gets its
 *  own item rather than a blank trigger: the pick is still what the turn resolves, so the pane must say so. */
function VariableSelectControl({ spec, value, onPick }: VariableControlProps): ReactElement {
  const stored = value !== undefined && value.length > 0 ? value : undefined;
  const isOrphan = stored !== undefined && !spec.options.some((option) => option.value === stored);
  const items = [
    { label: variableUnsetSummary(spec), value: UNSET },
    ...spec.options.map((option) => ({ label: option.label, value: option.value })),
    ...(isOrphan ? [{ label: `${stored} (no longer offered)`, value: stored }] : []),
  ];
  return (
    <Field label={spec.question}>
      <Select
        aria-label={spec.question}
        items={items}
        value={stored ?? UNSET}
        onValueChange={(next: string | null): void => onPick(next === UNSET || next === null ? undefined : next)}
      />
    </Field>
  );
}

/** A multi-select variable — a checkbox set stored as ONE `separator`-joined string (the shape the turn
 *  splits again). `randomPick` draws one part of it per reply. Unchecking everything IS the unset arm (an
 *  empty string reads as unpicked), so there is no separate "Use default" affordance. */
function VariableMultiControl({ spec, value, onPick }: VariableControlProps): ReactElement {
  const rowId = useId();
  const picked = (value ?? "")
    .split(spec.separator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  let consequence = variableUnsetSummary(spec);
  if (picked.length > 0) {
    consequence = spec.randomPick ? "Draws one of the checked options each reply." : "The checked options, joined.";
  }
  const toggle = (optionValue: string, checked: boolean): void => {
    // Rebuild in the AUTHORED option order (never click order) so the joined string is stable across edits.
    const next = spec.options.filter((option) => (option.value === optionValue ? checked : picked.includes(option.value))).map((option) => option.value);
    onPick(next.length === 0 ? undefined : next.join(spec.separator));
  };
  return (
    <Fieldset>
      <FieldsetLegend>{spec.question}</FieldsetLegend>
      <Stack gap="field">
        {spec.options.map((option) => (
          <SettingCheckboxRow
            key={option.value}
            id={`${rowId}-${option.value}`}
            label={option.label}
            checked={picked.includes(option.value)}
            onChange={(checked): void => toggle(option.value, checked)}
          />
        ))}
        <Text size="micro" tone="muted">
          {consequence}
        </Text>
      </Stack>
    </Fieldset>
  );
}

function VariableControl(props: VariableControlProps): ReactElement {
  return props.spec.multiSelect ? <VariableMultiControl {...props} /> : <VariableSelectControl {...props} />;
}

/** Rebuild the whole variables map with ONE variable set (or, for `next === undefined`, unset). Stored keys
 *  the preset no longer declares survive untouched — the turn still resolves them (the resolver's
 *  orphan-preserve arm), so an edit here must not quietly drop them. */
function withVariablePick(values: ChoiceBlockValues, name: string, next: string | undefined): ChoiceBlockValues {
  const rest = { ...values };
  delete rest[name];
  return next === undefined ? rest : { ...rest, [name]: next };
}

export interface UserMacroPicksSectionProps {
  readonly chatId: ChatId;
}

/** The "Macro picks" section body — the room's answers to BOTH declared knob families: the preset's
 *  ChoiceBlock variables, then one group per pickable macro (a control per typed input). The two reads run in
 *  PARALLEL (`useSuspenseQueries` — two sequential `useSuspenseQuery`s would waterfall the pane behind two
 *  round trips) and each family paints only when the preset declares one. */
export function UserMacroPicksSection({ chatId }: UserMacroPicksSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data }, { data: variableData }] = useSuspenseQueries({
    queries: [trpc.chat.getUserMacroPicks.queryOptions({ chatId }), trpc.chat.getVariablePicks.queryOptions({ chatId })],
  });
  const setValues = useSetUserMacroValues({ trpc, invalidation });
  const setVariables = useSetVariables({ trpc, invalidation });

  if (data.macros.length === 0 && variableData.variables.length === 0) {
    // NOT rendered as nothing (omit ≠ none-yet): the section says the feature exists and where it comes from,
    // so an author who declared a macro without inputs isn't left wondering why the pane is blank.
    return (
      <Text size="micro" tone="muted">
        The preset this chat runs declares no variables and no macro inputs. Add a variable or a typed macro input (Presets → Prompt / Macros) and it appears
        here to pick per chat.
      </Text>
    );
  }

  const pick = (macro: string, input: string, next: PickValue | undefined): void => {
    setValues.mutate({ chatId, values: withPick(data.values, macro, input, next) });
  };
  const pickVariable = (name: string, next: string | undefined): void => {
    setVariables.mutate({ chatId, values: withVariablePick(variableData.values, name, next) });
  };

  return (
    <Stack gap="section">
      {variableData.variables.length > 0 ? (
        <Stack gap="field">
          <Heading level={4} size="body">
            Variables
          </Heading>
          {variableData.variables.map((spec) => (
            <VariableControl key={spec.name} spec={spec} value={variableData.values[spec.name]} onPick={(next): void => pickVariable(spec.name, next)} />
          ))}
        </Stack>
      ) : null}
      {data.macros.map((macro) => (
        <Stack gap="field" key={macro.name}>
          <Heading level={4} size="body">{`{{${macro.name}}}`}</Heading>
          {macro.description.length > 0 ? (
            <Text size="micro" tone="muted">
              {macro.description}
            </Text>
          ) : null}
          {macro.inputs.map((input) => (
            <InputControl
              input={input}
              key={input.name}
              onPick={(next): void => pick(macro.name, input.name, next)}
              value={pickOf(data.values, macro.name, input.name)}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
