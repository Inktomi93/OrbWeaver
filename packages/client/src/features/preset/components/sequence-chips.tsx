// The string chip lists — `params.stop` and `params.drySequenceBreakers`, each capability-gated by its caller.
// One anatomy for both; the #1587/#1620 accessible-name ruling below holds for each. A chip reads and is typed
// in its escaped form (`lib/sequence-escapes.ts`), so a newline breaker is visible.

import type { PromptConfig } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Icon, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row } from "@orb/ui/layout";
import type { KeyboardEvent, ReactElement } from "react";
import type { AppFormInstance } from "#forms/editor";
import { decodeSequence, encodeSequence } from "../lib/sequence-escapes.ts";

type AppForm = AppFormInstance<PromptConfig>;

/** The stop-sequence group's hover hint — hoisted out of the JSX so the legend row and the `subject` it
 *  names read as one decision. */
const STOP_SEQUENCE_HINT = "The model stops generating when it would emit one of these. Type a sequence and press Enter; \\n is a newline.";
const DRY_BREAKER_HINT = "DRY never counts a repeat across one of these, so names and formatting can recur. Type one and press Enter; \\n is a newline.";

interface SequenceChipsProps {
  readonly form: AppForm;
  readonly name: "params.stop" | "params.drySequenceBreakers";
  readonly legend: string;
  readonly hint: string;
  /** The singular noun the add box and each remove button name ("stop sequence"). */
  readonly noun: string;
  /** Write the absence, not `[]`, when the last chip goes: a list the server refuses empty must stay unset. */
  readonly unsetWhenEmpty: boolean;
}

/** G2 — the `params.stop` chip list. */
export function StopSequences({ form }: { readonly form: AppForm }): ReactElement {
  return <SequenceChips form={form} hint={STOP_SEQUENCE_HINT} legend="Stop sequences" name="params.stop" noun="stop sequence" unsetWhenEmpty={false} />;
}

/** The DRY sampler's sequence breakers — llama.cpp refuses an empty list, so clearing the last one unsets it. */
export function DrySequenceBreakers({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <SequenceChips
      form={form}
      hint={DRY_BREAKER_HINT}
      legend="DRY sequence breakers"
      name="params.drySequenceBreakers"
      noun="DRY sequence breaker"
      unsetWhenEmpty={true}
    />
  );
}

/** No chip-input primitive exists in the seal and none is needed: Badge chips + a ghost × + an add Input is
 *  the landed tag-chip anatomy. */
function SequenceChips({ form, name, legend, hint, noun, unsetWhenEmpty }: SequenceChipsProps): ReactElement {
  return (
    <form.AppField name={name}>
      {(field): ReactElement => {
        const sequences = (field.state.value as readonly string[] | undefined) ?? [];
        const write = (next: readonly string[]): void => field.handleChange(next.length === 0 && unsetWhenEmpty ? undefined : [...next]);
        const add = (event: KeyboardEvent<HTMLInputElement>): void => {
          if (event.key !== "Enter") {
            return;
          }
          event.preventDefault();
          const input = event.currentTarget;
          const next = decodeSequence(input.value);
          if (next === "" || sequences.includes(next)) {
            return;
          }
          write([...sequences, next]);
          input.value = "";
        };
        // A FIELDSET, NOT A FIELD (#1620, closing what #1587 opened). This row is a GROUP — N chips plus an
        // add box — and a `Field` names exactly ONE control: Base UI reaches the sole `Field.Control` (the
        // add Input) with the label's `aria-labelledby`, which OUTRANKS `aria-label` by the accname spec's
        // own precedence. So the box announced the group's name, on the wrong element, and the add box's own
        // name was unreachable. `Fieldset`/`FieldsetLegend` name the GROUP (the macro-picks-pane anatomy),
        // which frees the add box to carry its own name.
        //
        // HINT, not `description` (crunch-list 21): a Field description renders at the 13px/muted step, which
        // is a FIFTH type tuple on a deck whose helper voice is `gloss`. A Fieldset has no hint slot, so the
        // trigger is composed beside the legend the way `Field` composes it beside its label — a SIBLING,
        // never a descendant, because nesting it leaks "More info" into the group's name through the W3C
        // accname subtree concatenation. `knob-row.tsx` already does exactly this on this deck.
        return (
          <Fieldset>
            <Row align="center" gap="tight">
              <FieldsetLegend>{legend}</FieldsetLegend>
              <HintTrigger className="shrink-0" hint={hint} subject={legend} />
            </Row>
            <Row className="flex-wrap" gap="field">
              {sequences.map((sequence) => {
                const shown = encodeSequence(sequence);
                return (
                  <Badge intent="neutral" key={sequence} size="sm" tone="soft">
                    {shown}
                    <Button
                      aria-label={`Remove ${noun} ${shown}`}
                      intent="ghost"
                      onClick={(): void => write(sequences.filter((s) => s !== sequence))}
                      size="icon"
                      type="button"
                    >
                      <Icon icon={X} size="xs" />
                    </Button>
                  </Badge>
                );
              })}
              {/* Outside a `Field` there is no context-injected `aria-labelledby` to outrank it, so this is the
                  box's actual accessible name (pinned in params-deck.ct.tsx by role+name). */}
              <Input aria-label={`Add ${noun}`} onKeyDown={add} placeholder="add…" />
            </Row>
          </Fieldset>
        );
      }}
    </form.AppField>
  );
}
