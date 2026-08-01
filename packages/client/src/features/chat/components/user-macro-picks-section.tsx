// The MU PICKS pane (#24) — the client half of the per-chat user-macro input picks. A preset author declares
// a macro with typed INPUTS (`{{mood}}` with a Tone select, a random-pick pool, …); this section is where the
// room decides what those inputs resolve to. Reads `chat.getUserMacroPicks` (the pickable declarations + the
// stored bag) and writes the WHOLE rebuilt bag through `chat.setUserMacroValues` on every edit — the verb is
// a column flush, so there is no per-input patch verb to reach for.
//
// PER-CHAT, not per-user (the MU spec's Arm-A owner ruling): the picks are room state every member shares and
// every member may edit (the `setVariables` member floor), so the copy says "this chat", never "yours".
//
// UNSET IS A REAL STATE, rendered as one (empty-states doctrine). An input with no stored pick resolves its
// per-kind default at turn time (`resolveUserMacroInputs`, the ONE resolution home) — so every control offers
// an explicit "Use default" and says what the default resolves TO, instead of silently showing the fallback as
// if it had been chosen. The select-family carries that as a first item; the checkbox-family (a stored pick is
// an ARRAY, which no checkbox can un-pick back to absent) carries it as a "Use default" button.
//
// Discrete-write control OUTSIDE an autosave form ⇒ OPTIMISTIC (the `setChatBackground` precedent): the pick
// must paint before the round trip, and the `chatUpdated` bus echo is the reconciliation.

import type { UserMacroValues } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import type { UserMacroInputDef } from "@orb/kit/macro";
import { userMacroToggleDefaultsOn } from "@orb/kit/macro";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Heading, Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { SettingCheckboxRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useSetUserMacroValues } from "../hooks/use-context-panel-mutations";

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

export interface UserMacroPicksSectionProps {
  readonly chatId: ChatId;
}

/** The "Macro picks" section body — one group per pickable macro, one control per typed input. */
export function UserMacroPicksSection({ chatId }: UserMacroPicksSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.chat.getUserMacroPicks.queryOptions({ chatId }));
  const setValues = useSetUserMacroValues({ trpc, invalidation });

  if (data.macros.length === 0) {
    // NOT rendered as nothing (omit ≠ none-yet): the section says the feature exists and where it comes from,
    // so an author who declared a macro without inputs isn't left wondering why the pane is blank.
    return (
      <Text size="micro" tone="muted">
        The preset this chat runs declares no macro inputs. Add a typed input to one of its macros (Presets → Macros) and it appears here to pick per chat.
      </Text>
    );
  }

  const pick = (macro: string, input: string, next: PickValue | undefined): void => {
    setValues.mutate({ chatId, values: withPick(data.values, macro, input, next) });
  };

  return (
    <Stack gap="section">
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
