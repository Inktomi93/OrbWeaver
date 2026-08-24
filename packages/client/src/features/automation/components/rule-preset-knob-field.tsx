// B2 — ONE rule-preset knob's EDITOR. Split out of `rule-preset-picker.tsx` when the entityRef arm (#630)
// pushed that file past the `component-size` cap: the picker owns the popover/catalogue/mint ceremony, this
// file owns what one knob LOOKS like, and `lib/rule-preset-knob-model.ts` owns what counts as a usable
// value for it.
//
// KNOB EDITORS dispatch EXHAUSTIVELY over the descriptor `kind` (§5.5): a new `RulePresetKnobKind` fails
// `tsc` at the `never` default. The switch runs on a `RulePresetKnobDescriptor`-typed local, NOT on the
// wire's `RulePresetKnobView` (= descriptor & `{key}`): biome's type service does not narrow a switch over
// an INTERSECTED union (it marks every case after the first unreachable), while it narrows the plain union
// cleanly — and a `View` is assignable to the descriptor, so `key`/`label`/`help` stay readable off the
// view alongside.
//
// ONE CONTROL PER COMPONENT, deliberately. The editors were arms of a single switch inside `KnobField` —
// mutually exclusive returns, so exactly one control ever renders — but `form-factory-for-multifield`
// counts controlled inputs PER ENCLOSING COMPONENT with no notion of exclusive arms, so the dispatcher read
// as a hand-rolled multi-field form. Splitting is the honest fix rather than a suppression: the count
// becomes structurally true (one field each), and each arm gets its own NARROWED descriptor type instead of
// the widened local the switch needed.
//
// THE `entityRef` ARM IS THE ONE THAT READS THE CHAT (#630). Every other editor is pure over its
// descriptor; this one asks the server what THIS ROOM has, because the whole point is that a host never
// types a TypeID from memory. Its three non-pickable states are SAID rather than rendered as an empty
// dropdown: loading, a failed read, and — the honest one — a room with no lorebooks attached, which no
// picker can invent. The mint's own refusal stays reachable behind all of it: attachment is a LIVE fact
// (`domain/automation/substrate/validate.ts`), so a book listed at render can stop qualifying before the
// press, and that refusal rides `mintFailureToast`.

import type {
  RulePresetChoiceKnobDescriptor,
  RulePresetEntityKind,
  RulePresetEntityRefKnobDescriptor,
  RulePresetKnobDescriptor,
  RulePresetKnobValueInput,
  RulePresetKnobView,
  RulePresetNumberKnobDescriptor,
  RulePresetTextKnobDescriptor,
  RulePresetTextListKnobDescriptor,
} from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { NumberField } from "@orb/ui/number-field";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
// the value shape is the CONTRACT's wire-input bag (`lib/rule-preset-knob-model.ts` states why).
import { clampKnobNumber, knobIssue } from "../lib/rule-preset-knob-model.ts";

export interface KnobFieldProps {
  readonly knob: RulePresetKnobView;
  /** The room being configured. Only the `entityRef` arm reads it (its options ARE this chat's rows); the
   *  scalar arms are pure over their descriptor and ignore it. */
  readonly chatId: ChatId;
  readonly value: RulePresetKnobValueInput | undefined;
  readonly onChange: (next: RulePresetKnobValueInput) => void;
  /** Show the blocking issue on the FIELD. False until the host has touched it or pressed Add: a form that
   *  opens red-ringed and "Required." before anyone types reads as already-rejected (side-eye #621 P1-4 —
   *  the catalogue's stated natural-first card opened that way). The Add button still says what is
   *  missing, so nothing is hidden; only the accusation waits its turn. */
  readonly showIssue: boolean;
}

/** The labeled row every knob editor sits in — label + optional help + the inline validity issue. Shared by
 *  the per-kind editors below so the row grammar is spelled once. */
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

function NumberKnobField({
  knob,
  descriptor,
  value,
  onChange,
  showIssue,
}: KnobFieldProps & { readonly descriptor: RulePresetNumberKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={showIssue ? knobIssue(descriptor, value) : null}>
      <NumberField
        aria-label={knob.label}
        min={descriptor.min}
        max={descriptor.max}
        value={typeof value === "number" ? value : descriptor.default}
        onValueChange={(next): void => onChange(next === null ? descriptor.default : clampKnobNumber(next, descriptor.min, descriptor.max))}
      />
    </KnobRow>
  );
}

function TextKnobField({ knob, descriptor, value, onChange, showIssue }: KnobFieldProps & { readonly descriptor: RulePresetTextKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={showIssue ? knobIssue(descriptor, value) : null}>
      <Input aria-label={knob.label} value={typeof value === "string" ? value : ""} onValueChange={(next): void => onChange(next)} />
    </KnobRow>
  );
}

function TextListKnobField({
  knob,
  descriptor,
  value,
  onChange,
  showIssue,
}: KnobFieldProps & { readonly descriptor: RulePresetTextListKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={showIssue ? knobIssue(descriptor, value) : null}>
      <Textarea
        aria-label={knob.label}
        rows={3}
        value={Array.isArray(value) ? value.join("\n") : ""}
        onValueChange={(next): void => onChange(next.split("\n"))}
      />
    </KnobRow>
  );
}

function ChoiceKnobField({
  knob,
  descriptor,
  value,
  onChange,
  showIssue,
}: KnobFieldProps & { readonly descriptor: RulePresetChoiceKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={showIssue ? knobIssue(descriptor, value) : null}>
      <Select<string>
        aria-label={knob.label}
        items={descriptor.options.map((option) => ({ value: option, label: option }))}
        value={typeof value === "string" ? value : descriptor.default}
        onValueChange={(next): void => onChange(next ?? descriptor.default)}
      />
    </KnobRow>
  );
}

/** The lorebook chooser — the ONE `entityRef` entity that ships (#630). Reads the books attached to THIS
 *  chat, which is the same set `substrate/validate.ts` will accept at mint, so a listed option is a book
 *  the mint can take.
 *
 *  `useQuery`, NOT `useSuspenseQuery`: suspending HERE would throw the whole popover body back to its
 *  `QueryBoundary` fallback mid-form, and the three non-pickable outcomes are things a host needs to READ
 *  rather than a spinner over the whole card. The empty arm deliberately prescribes nothing: no client
 *  affordance attaches a book to a chat today, so a "go attach one" line would point at a door that is not
 *  there (reported separately). */
function WorldInfoBookKnobField({ knob, chatId, value, onChange, showIssue }: KnobFieldProps): ReactElement {
  const trpc = useTRPC();
  const books = useQuery(trpc.worldInfo.listForChat.queryOptions({ chatId }));
  const chosen = typeof value === "string" && value.length > 0 ? value : null;
  const issue = showIssue ? knobIssue(knob, value) : null;

  if (books.isPending) {
    return (
      <KnobRow knob={knob} issue={null}>
        <Text voice="gloss">Loading this room's lorebooks…</Text>
      </KnobRow>
    );
  }
  if (books.isError) {
    return (
      <KnobRow knob={knob} issue={issue}>
        <Text voice="gloss">Couldn't load this room's lorebooks.</Text>
      </KnobRow>
    );
  }
  const items: SelectItems<string> = books.data.map((book) => ({ value: book.id, label: book.name }));
  if (items.length === 0) {
    return (
      <KnobRow knob={knob} issue={null}>
        <Text voice="gloss">This room has no lorebooks attached yet, so there is nothing for this rule to write into.</Text>
      </KnobRow>
    );
  }
  return (
    <KnobRow knob={knob} issue={issue}>
      <Select<string>
        aria-label={knob.label}
        items={items}
        placeholder="Choose a lorebook…"
        value={chosen}
        onValueChange={(next): void => onChange(next ?? "")}
      />
    </KnobRow>
  );
}

/** The entity axis → its editor. A MAPPED-TYPE Record, not a switch (§5.5's other sanctioned dispatch
 *  shape), and over a ONE-MEMBER union it is the only honest one: a `switch` with a single `case` plus a
 *  `never` default is a tautology both linters refuse to let stand (biome calls the case unreachable,
 *  eslint calls the comparison always-true — the single-arm-union-seam rule: keep the extensible shape,
 *  never pre-write the tautological runtime filter). The Record keeps the compile force with no
 *  tautology at all: a second `RulePresetEntityKind` with no entry here is a `tsc` error. Each entity
 *  needs its OWN chat-scoped read and its own empty copy, so they cannot share a component. */
const ENTITY_REF_FIELDS: { readonly [TEntity in RulePresetEntityKind]: (props: KnobFieldProps) => ReactElement } = {
  worldInfoBook: WorldInfoBookKnobField,
};

function EntityRefKnobField({ descriptor, ...props }: KnobFieldProps & { readonly descriptor: RulePresetEntityRefKnobDescriptor }): ReactElement {
  const EntityField = ENTITY_REF_FIELDS[descriptor.entity];
  return <EntityField {...props} />;
}

/** One knob's editor, dispatched exhaustively over its descriptor kind (§5.5 — a new
 *  `RulePresetKnobKind` fails `tsc` at the `never` default). The switch runs on a plain
 *  `RulePresetKnobDescriptor` local (see the header) while `key`/`label`/`help` read off the view. */
export function KnobField(props: KnobFieldProps): ReactElement {
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
    case "entityRef":
      return <EntityRefKnobField {...props} descriptor={descriptor} />;
    default: {
      const exhaustive: never = descriptor;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
