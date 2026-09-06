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
// dropdown: loading, a failed read, and — the honest one — a room with no world books attached, which no
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
import { NumberField } from "@orb/ui/number-field";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
// the value shape is the CONTRACT's wire-input bag (`lib/rule-preset-knob-model.ts` states why).
import { clampKnobNumber, knobBlockingLine, knobIssue } from "../lib/rule-preset-knob-model.ts";

export interface KnobFieldProps {
  readonly knob: RulePresetKnobView;
  /** The SCOPE being configured — a room, or `null` for the owner-GLOBAL lane (C5). Only the `entityRef`
   *  arm reads it (its options ARE this chat's rows); the scalar arms are pure over their descriptor and
   *  ignore it entirely, which is why the global lane needs nothing from them. */
  readonly chatId: ChatId | null;
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

/** A `text` knob is a TEXTAREA, not an Input (#655). These knobs carry PROMPT SENTENCES — the literal text
 *  the rule sends to the model, up to 2000 characters — and a single-line `Input` showed 44% of the pacing
 *  nudge's own 93-character default (measured `clientWidth=291 scrollWidth=663`): a host minted, and paid
 *  for, a prompt they could not read. `rows={1}` keeps the SHORT text knobs (a veil marker, an entry name)
 *  looking like the one-line controls they are — `field-sizing: content` grows the box only when the value
 *  actually wraps — and the ceiling turns a long value into the field's own scroll rather than a box that
 *  pushes the Add button off the popover. */
const TEXT_KNOB_MAX_ROWS = 6;

function TextKnobField({ knob, descriptor, value, onChange, showIssue }: KnobFieldProps & { readonly descriptor: RulePresetTextKnobDescriptor }): ReactElement {
  return (
    <KnobRow knob={knob} issue={showIssue ? knobIssue(descriptor, value) : null}>
      <Textarea
        aria-label={knob.label}
        rows={1}
        maxRows={TEXT_KNOB_MAX_ROWS}
        maxLength={descriptor.maxLength}
        value={typeof value === "string" ? value : ""}
        onValueChange={(next): void => onChange(next)}
      />
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
        // The descriptor's OWN labels (#655) — `options` are wire values (`ask`/`write`,
        // `scenario`/`background`), and rendering them raw put three unexplained lowercase words in front
        // of a host configuring a rule that spends money. The `?? option` is the honest degrade for the
        // ERASED descriptor type (`Record<string, string>` loses the per-option `tsc` force the preset def
        // has), the same posture `triggerLabel` takes on an unrecognized stored discriminator.
        items={descriptor.options.map((option) => ({ value: option, label: descriptor.optionLabels[option] ?? option }))}
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
 *  rather than a spinner over the whole card.
 *
 *  THE EMPTY ARM NOW POINTS SOMEWHERE (#640). It used to prescribe nothing on purpose — no client affordance
 *  attached a book to a chat, so a "go attach one" line would have pointed at a door that was not there. The
 *  door exists now: the "This chat" tab's World books section (`features/chat/chat-books-section.tsx`), which
 *  is the SAME attachment `substrate/validate.ts` gates the mint on, so the sentence names the one place
 *  that makes this card completable. */
function WorldInfoBookKnobField({ chatId, ...props }: KnobFieldProps): ReactElement {
  // The SPLIT is a hooks-rules fix, not decoration: the chat arm runs `useQuery`, so the chat-less arm has
  // to be a different COMPONENT rather than an early return. (An `enabled: false` query would report
  // `isPending` forever and paint "Loading this room's world books…" at a surface that has no room.)
  return chatId === null ? <GlobalEntityRefUnavailable knob={props.knob} /> : <ChatWorldInfoBookKnobField {...props} chatId={chatId} />;
}

/** The chat-less arm of every `entityRef` knob, TYPED-AND-REFUSING (C5). A library-wide rule has no room
 *  whose attached books could be listed, and the honest widening is a chooser over the AUTHOR's OWN library
 *  — a read that does not exist on this surface yet. No committed global preset declares an entityRef knob,
 *  so this is unreachable today; it exists because the NEXT one will, and an unhandled kind would otherwise
 *  render an empty control that silently blocks the mint. It says what is missing instead. */
function GlobalEntityRefUnavailable({ knob }: { readonly knob: RulePresetKnobView }): ReactElement {
  return (
    <KnobRow knob={knob} issue={null}>
      <Text voice="gloss">Library-wide rules can't pick a world book here yet — add this rule inside a chat, where its books can be listed.</Text>
    </KnobRow>
  );
}

function ChatWorldInfoBookKnobField({ knob, chatId, value, onChange, showIssue }: KnobFieldProps & { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const books = useQuery(trpc.worldInfo.listForChat.queryOptions({ chatId }));
  const chosen = typeof value === "string" && value.length > 0 ? value : null;
  const issue = showIssue ? knobIssue(knob, value) : null;

  if (books.isPending) {
    return (
      <KnobRow knob={knob} issue={null}>
        <Text voice="gloss">Loading this room's world books…</Text>
      </KnobRow>
    );
  }
  if (books.isError) {
    return (
      <KnobRow knob={knob} issue={issue}>
        <Text voice="gloss">Couldn't load this room's world books.</Text>
      </KnobRow>
    );
  }
  const items: SelectItems<string> = books.data.map((book) => ({ value: book.id, label: book.name }));
  if (items.length === 0) {
    return (
      <KnobRow knob={knob} issue={null}>
        <Text voice="gloss">
          This room has no world books attached yet, so there is nothing for this rule to write into. Attach one under World books, higher up this tab, and it
          can be picked here.
        </Text>
      </KnobRow>
    );
  }
  return (
    <KnobRow knob={knob} issue={issue}>
      <Select<string>
        aria-label={knob.label}
        items={items}
        placeholder="Choose a world book…"
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

export interface KnobBlockingLineProps {
  /** The first knob whose value is not yet usable — what the mint is waiting on. */
  readonly knob: RulePresetKnobView;
  /** The scope being configured; `null` = the owner-global lane (see {@link KnobFieldProps.chatId}). */
  readonly chatId: ChatId | null;
}

/** The lorebook arm of the blocking line. It asks the SAME chat-scoped read the chooser above it asks
 *  (react-query dedupes them into one request), because the two must agree: when the room has no books the
 *  chooser correctly says so and points at World books, while the blocking line underneath used to say
 *  "Choose a lorebook to add this rule." — an instruction that cannot be obeyed on this surface, sitting in
 *  the position a host reads LAST before pressing Add (#655). An empty chooser is not a missing CHOICE, it
 *  is a missing PREREQUISITE, and only the read knows which one it is. */
function WorldInfoBookBlockingLine({ knob, chatId }: KnobBlockingLineProps): ReactElement {
  // The chat-less arm splits into its own component for the SAME hooks-rules reason the chooser above does.
  return chatId === null ? <Text voice="gloss">{knobBlockingLine(knob)}</Text> : <ChatWorldInfoBookBlockingLine knob={knob} chatId={chatId} />;
}

function ChatWorldInfoBookBlockingLine({ knob, chatId }: KnobBlockingLineProps & { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const books = useQuery(trpc.worldInfo.listForChat.queryOptions({ chatId }));
  // Only a SETTLED empty read re-points the line: while it is loading or errored there is no evidence the
  // room lacks books, and naming the wrong door is worse than naming the generic one.
  const nothingToChoose = books.isSuccess && books.data.length === 0;
  return (
    <Text voice="gloss">
      {nothingToChoose ? "Attach a world book under World books, higher up this tab — then this rule can be added." : knobBlockingLine(knob)}
    </Text>
  );
}

/** The entity axis → its blocking line, the twin of `ENTITY_REF_FIELDS` above and a mapped-type Record for
 *  the same reason: each entity's "is there anything to choose here" question is its own chat-scoped read. */
const ENTITY_REF_BLOCKING_LINES: { readonly [TEntity in RulePresetEntityKind]: (props: KnobBlockingLineProps) => ReactElement } = {
  worldInfoBook: WorldInfoBookBlockingLine,
};

/** The line above a blocked Add naming what is missing. A COMPONENT and not a string, because one arm's
 *  answer depends on a live chat-scoped read: `lib/rule-preset-knob-model.ts`'s `knobBlockingLine` is the
 *  pure default, and the `entityRef` arm overrides it when its chooser has nothing to offer. It mounts only
 *  while the mint is blocked, so the read it runs is never speculative. */
export function KnobBlockingLine({ knob, chatId }: KnobBlockingLineProps): ReactElement {
  const descriptor: RulePresetKnobDescriptor = knob;
  if (descriptor.kind !== "entityRef") {
    return <Text voice="gloss">{knobBlockingLine(knob)}</Text>;
  }
  const BlockingLine = ENTITY_REF_BLOCKING_LINES[descriptor.entity];
  return <BlockingLine knob={knob} chatId={chatId} />;
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
