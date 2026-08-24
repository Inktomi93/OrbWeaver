// B2 — the RULE preset PICKER (interaction-direction-spec §7 B2 deliverable 2). An inline popover that
// lists the committed rule presets (`automation.listRulePresets`) and mints one into the chat via
// `automation.createRuleFromPreset`. v1 knob-edit is RE-MINT (no post-mint editing), so the flow is
// pick → set knobs → add; a minted rule is born DISABLED and appears in the list beside hand-authored ones.
//
// VOCABULARY (owner ruling, #599): "preset" bare means a GENERATION preset. These are RULE presets — every
// user-facing string here says "rule" (the trigger is "Add rule…", never "preset picker").
//
// KNOB EDITORS dispatch EXHAUSTIVELY over the descriptor `kind` (§5.5): a new `RulePresetKnobKind` fails
// `tsc` at the `never` default. The switch runs on a `RulePresetKnobDescriptor`-typed local, NOT on the
// wire's `RulePresetKnobView` (= descriptor & `{key}`): biome's type service does not narrow a switch over
// an INTERSECTED union (it marks every case after the first unreachable), while it narrows the plain union
// cleanly — and a `View` is assignable to the descriptor, so `key`/`label`/`help` stay readable off the
// view alongside.
//
// Two client-side guards beyond the wire, both defense-in-depth against a server whose knob DEFAULTS bypass
// their own bounds (`substrate/presets.ts::resolveKnob` returns the default unvalidated — A3-verify note):
// number inputs CLAMP to [min,max] on entry, and a required text knob (an empty-default reference like a
// lorebook id) blocks the mint with an inline "Required" until it is filled — so a book-needing rule
// surfaces the missing book BEFORE the mint, and if the mint still refuses typed (a book not attached to
// this chat), the reason rides the mutation's error toast.

import type {
  RulePresetChoiceKnobDescriptor,
  RulePresetKnobDescriptor,
  RulePresetKnobView,
  RulePresetNumberKnobDescriptor,
  RulePresetTextKnobDescriptor,
  RulePresetTextListKnobDescriptor,
  RulePresetView,
} from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Icon, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@orb/ui/popover";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useCreateRuleFromPreset } from "../lib/rule-mutations.ts";

/** A knob's live value in the picker form — MUTABLE arrays (the mint's `knobs` input is
 *  `z.array(z.string())` = `string[]`, and the contract's `RulePresetKnobValue` carries a `readonly string[]`
 *  arm that will not assign into it), so the picker holds its own mutable shape and hands it straight to the
 *  wire. `textList` values keep blank lines while editing; they are cleaned at validate/mint time. */
type KnobValue = number | string | string[];
type KnobValues = Record<string, KnobValue>;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** One knob's default value — the descriptor default, with a number default CLAMPED to its own bounds (the
 *  server would return an out-of-range shipped default verbatim, so the client re-derives it in range). */
function defaultForKnob(knob: RulePresetKnobDescriptor): KnobValue {
  switch (knob.kind) {
    case "number":
      return clampNumber(knob.default, knob.min, knob.max);
    case "text":
      return knob.default;
    case "textList":
      return [...knob.default];
    case "choice":
      return knob.default;
    default: {
      const exhaustive: never = knob;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** The default value bag for a preset — every declared knob at its (clamped) descriptor default. */
function defaultValues(knobs: readonly RulePresetKnobView[]): KnobValues {
  const values: KnobValues = {};
  for (const knob of knobs) {
    values[knob.key] = defaultForKnob(knob);
  }
  return values;
}

/** The non-empty lines of a textList value (its editing form keeps blank lines; the mint wants the clean set).
 *  Narrows off the value UNION (not `Array.isArray`, which tsc cannot reduce back to `string[]` here). */
function cleanTextList(value: KnobValue | undefined): string[] {
  if (value === undefined || typeof value === "number" || typeof value === "string") {
    return [];
  }
  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** The per-knob validity issue a host must resolve before the mint, or `null` when the value is admissible.
 *  Mirrors the server's `resolveKnob` refusals so the block happens at the field, not as a toast after the
 *  round trip — a text knob is never validly empty (a lorebook-id knob is the live case). */
function knobIssue(knob: RulePresetKnobDescriptor, value: KnobValue | undefined): string | null {
  switch (knob.kind) {
    case "number":
      return null; // clamped on entry — always in range.
    case "text":
      return typeof value === "string" && value.trim().length > 0 ? null : "Required.";
    case "textList": {
      const entries = cleanTextList(value);
      if (entries.length < knob.minItems) {
        return `Add at least ${knob.minItems}.`;
      }
      if (entries.length > knob.maxItems) {
        return `At most ${knob.maxItems}.`;
      }
      return null;
    }
    case "choice":
      return null; // a Select can only hold one of the declared options.
    default: {
      const exhaustive: never = knob;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** The override bag to send at mint — textList knobs cleaned to their non-empty entries; everything else as
 *  held. Every declared key is sent (all are valid keys), so the verb resolves defaults only where a value
 *  is missing. */
function mintOverrides(knobs: readonly RulePresetKnobView[], values: KnobValues): KnobValues {
  const overrides: KnobValues = {};
  for (const knob of knobs) {
    overrides[knob.key] = knob.kind === "textList" ? [...cleanTextList(values[knob.key])] : (values[knob.key] ?? "");
  }
  return overrides;
}

interface KnobFieldProps {
  readonly knob: RulePresetKnobView;
  readonly value: KnobValue | undefined;
  readonly onChange: (next: KnobValue) => void;
}

/** The labeled row every knob editor sits in — label + optional help + the inline validity issue. Shared by
 *  the four per-kind editors below so the row grammar is spelled once. */
function KnobRow({
  knob,
  issue,
  children,
}: {
  readonly knob: RulePresetKnobView;
  readonly issue: string | null;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <Field
      label={knob.label}
      orientation="vertical"
      {...(knob.help === undefined ? {} : { description: knob.help })}
      {...(issue === null ? {} : { error: issue })}
    >
      {children}
    </Field>
  );
}

// ONE CONTROL PER COMPONENT, deliberately. The four editors were arms of a single switch inside `KnobField`
// — mutually exclusive returns, so exactly one control ever renders — but `form-factory-for-multifield`
// counts controlled inputs PER ENCLOSING COMPONENT with no notion of exclusive arms, so the dispatcher read
// as a hand-rolled 4-field form. Splitting is the honest fix rather than a suppression: the count becomes
// structurally true (one field each), and each arm gets its own NARROWED descriptor type instead of the
// widened local the switch needed. (The gate's mis-count of exclusive arms is reported separately.)

function NumberKnobField({ knob, descriptor, value, onChange }: KnobFieldProps & { readonly descriptor: RulePresetNumberKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={knobIssue(descriptor, value)}>
      <NumberField
        aria-label={knob.label}
        min={descriptor.min}
        max={descriptor.max}
        value={typeof value === "number" ? value : descriptor.default}
        onValueChange={(next): void => onChange(next === null ? descriptor.default : clampNumber(next, descriptor.min, descriptor.max))}
      />
    </KnobRow>
  );
}

function TextKnobField({ knob, descriptor, value, onChange }: KnobFieldProps & { readonly descriptor: RulePresetTextKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={knobIssue(descriptor, value)}>
      <Input aria-label={knob.label} value={typeof value === "string" ? value : ""} onValueChange={(next): void => onChange(next)} />
    </KnobRow>
  );
}

function TextListKnobField({ knob, descriptor, value, onChange }: KnobFieldProps & { readonly descriptor: RulePresetTextListKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={knobIssue(descriptor, value)}>
      <Textarea
        aria-label={knob.label}
        rows={3}
        value={Array.isArray(value) ? value.join("\n") : ""}
        onValueChange={(next): void => onChange(next.split("\n"))}
      />
    </KnobRow>
  );
}

function ChoiceKnobField({ knob, descriptor, value, onChange }: KnobFieldProps & { readonly descriptor: RulePresetChoiceKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={knobIssue(descriptor, value)}>
      <Select<string>
        aria-label={knob.label}
        items={descriptor.options.map((option) => ({ value: option, label: option }))}
        value={typeof value === "string" ? value : descriptor.default}
        onValueChange={(next): void => onChange(next ?? descriptor.default)}
      />
    </KnobRow>
  );
}

/** One knob's editor, dispatched exhaustively over its descriptor kind (§5.5 — a new
 *  `RulePresetKnobKind` fails `tsc` at the `never` default). The switch runs on a plain
 *  `RulePresetKnobDescriptor` local (see the header) while `key`/`label`/`help` read off the view. */
function KnobField(props: KnobFieldProps): ReactElement {
  const descriptor: RulePresetKnobDescriptor = props.knob;
  switch (descriptor.kind) {
    case "number":
      return <NumberKnobField {...props} descriptor={descriptor} />;
    case "text":
      return <TextKnobField {...props} descriptor={descriptor} />;
    case "textList":
      return <TextListKnobField {...props} descriptor={descriptor} />;
    case "choice":
      return <ChoiceKnobField {...props} descriptor={descriptor} />;
    default: {
      const exhaustive: never = descriptor;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

interface RulePresetConfigureProps {
  readonly chatId: ChatId;
  readonly preset: RulePresetView;
  readonly onBack: () => void;
  readonly onDone: () => void;
}

/** The knob form for ONE chosen preset + the mint action. */
function RulePresetConfigure({ chatId, preset, onBack, onDone }: RulePresetConfigureProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mint = useCreateRuleFromPreset({ trpc, invalidation });
  const [values, setValues] = useState<KnobValues>(() => defaultValues(preset.knobs));

  const hasIssue = preset.knobs.some((knob) => knobIssue(knob, values[knob.key]) !== null);

  const add = (): void => {
    mint.mutate({ chatId, presetId: preset.id, knobs: mintOverrides(preset.knobs, values) }, { onSuccess: () => onDone() });
  };

  return (
    <Stack gap="block">
      <Row gap="block" align="center" justify="between">
        <Button intent="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Text voice="label">{preset.title}</Text>
      </Row>
      <Text voice="gloss">{preset.summary}</Text>
      {preset.knobs.map((knob) => (
        <KnobField key={knob.key} knob={knob} value={values[knob.key]} onChange={(next): void => setValues((prev) => ({ ...prev, [knob.key]: next }))} />
      ))}
      <Button intent="primary" size="sm" disabled={hasIssue} loading={mint.isPending} onClick={add}>
        {preset.ruleCount > 1 ? `Add ${preset.ruleCount} rules` : "Add rule"}
      </Button>
    </Stack>
  );
}

interface RulePresetListProps {
  readonly presets: readonly RulePresetView[];
  readonly onPick: (preset: RulePresetView) => void;
}

/** The catalogue list — one selectable row per rule preset. */
function RulePresetList({ presets, onPick }: RulePresetListProps): ReactElement {
  return (
    <Stack gap="block">
      {presets.map((preset) => (
        <Button
          key={preset.id}
          aria-label={preset.title}
          intent="ghost"
          // `wrap` is the arm for exactly this: a CHOICE affordance carrying a sentence — the label wraps
          // and the height follows the wrapped text, floored at the `sm` control height (the tap floor).
          // A call-site `h-auto` would defeat the sealed box (`ui-size-via-variant`); the
          // `message-choices-block` chip is the same shape and spells it the same way.
          size="wrap"
          className="justify-start text-left"
          onClick={(): void => onPick(preset)}
        >
          <Stack gap="tight">
            <Text voice="label">{preset.title}</Text>
            <Text voice="gloss">
              {preset.summary}
              {preset.confirmFirst ? " Asks before acting." : ""}
            </Text>
          </Stack>
        </Button>
      ))}
    </Stack>
  );
}

interface RulePresetPickerBodyProps {
  readonly chatId: ChatId;
  readonly onDone: () => void;
}

/** The popover body: the catalogue, then the chosen preset's knob form. Suspends on `listRulePresets`. */
function RulePresetPickerBody({ chatId, onDone }: RulePresetPickerBodyProps): ReactElement {
  const trpc = useTRPC();
  const { data: presets } = useSuspenseQuery(trpc.automation.listRulePresets.queryOptions());
  const [selected, setSelected] = useState<RulePresetView | null>(null);

  if (selected === null) {
    return <RulePresetList presets={presets} onPick={setSelected} />;
  }
  return <RulePresetConfigure chatId={chatId} preset={selected} onBack={(): void => setSelected(null)} onDone={onDone} />;
}

export interface RulePresetPickerProps {
  readonly chatId: ChatId;
}

/** The "Add rule…" inline popover — the picker entry point for the Rules section. */
export function RulePresetPicker({ chatId }: RulePresetPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button intent="secondary" size="sm">
            <Icon icon={Plus} size="sm" />
            Add rule…
          </Button>
        }
      />
      {/* No call-site width: the popup slot already seals its own box (`max-w-cq-sm` + the
          `max-h-(--available-height)` cap, capped-and-scrollable) — a `w-80` here would fight that seal
          rather than express anything the primitive does not already own (`ui-size-via-variant`). */}
      <PopoverPopup>
        <PopoverTitle>Add a rule</PopoverTitle>
        <QueryBoundary
          fallback={<SkeletonRows count={3} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="the rule catalogue" onRetry={retry} />}
        >
          <RulePresetPickerBody chatId={chatId} onDone={(): void => setOpen(false)} />
        </QueryBoundary>
      </PopoverPopup>
    </Popover>
  );
}
