// The stop-sequence chip list — `params.stop`, capability-gated on
// `sampling.stop` by its caller in params-limits.tsx. Its own module because that file reached the
// `component-size` cap (#1770); the anatomy and the #1587/#1620 accessible-name ruling below are unchanged.

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

type AppForm = AppFormInstance<PromptConfig>;

/** The stop-sequence group's hover hint — hoisted out of the JSX so the legend row and the `subject` it
 *  names read as one decision. */
const STOP_SEQUENCE_HINT = "The model stops generating when it would emit one of these. Type a sequence and press Enter.";

/** G2 — the `params.stop` chip list. No chip-input primitive exists in the seal and none is needed: Badge
 *  chips + a ghost × + an add Input is the landed tag-chip anatomy. */
export function StopSequences({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <form.AppField name="params.stop">
      {(field): ReactElement => {
        const stops = (field.state.value as readonly string[] | undefined) ?? [];
        const add = (event: KeyboardEvent<HTMLInputElement>): void => {
          if (event.key !== "Enter") {
            return;
          }
          event.preventDefault();
          const input = event.currentTarget;
          const next = input.value;
          if (next === "" || stops.includes(next)) {
            return;
          }
          field.handleChange([...stops, next]);
          input.value = "";
        };
        // A FIELDSET, NOT A FIELD (#1620, closing what #1587 opened). This row is a GROUP — N chips plus an
        // add box — and a `Field` names exactly ONE control: Base UI reaches the sole `Field.Control` (the
        // add Input) with the label's `aria-labelledby`, which OUTRANKS `aria-label` by the accname spec's
        // own precedence. So the box announced "Stop sequences" (the group's name, on the wrong element) and
        // "Add stop sequence" was unreachable — #1587 correctly refused to keep a dead attribute and stated
        // the fork here rather than faking a fix. The legend is that fork resolved: `Fieldset`/`FieldsetLegend`
        // name the GROUP (the macro-picks-pane anatomy), which frees the add box to carry its own name.
        //
        // HINT, not `description` (crunch-list 21): a Field description renders at the 13px/muted step, which
        // is a FIFTH type tuple on a deck whose helper voice is `gloss`. A Fieldset has no hint slot, so the
        // trigger is composed beside the legend the way `Field` composes it beside its label — a SIBLING,
        // never a descendant, because nesting it leaks "More info" into the group's name through the W3C
        // accname subtree concatenation. `knob-row.tsx` already does exactly this on this deck.
        return (
          <Fieldset>
            <Row align="center" gap="tight">
              <FieldsetLegend>Stop sequences</FieldsetLegend>
              <HintTrigger className="shrink-0" hint={STOP_SEQUENCE_HINT} subject="Stop sequences" />
            </Row>
            <Row className="flex-wrap" gap="field">
              {stops.map((stop) => (
                <Badge intent="neutral" key={stop} size="sm" tone="soft">
                  {stop}
                  <Button
                    aria-label={`Remove stop sequence ${stop}`}
                    intent="ghost"
                    onClick={(): void => field.handleChange(stops.filter((s) => s !== stop))}
                    size="icon"
                    type="button"
                  >
                    <Icon icon={X} size="xs" />
                  </Button>
                </Badge>
              ))}
              {/* Now REACHABLE: outside a `Field` there is no context-injected `aria-labelledby` to outrank
                  it, so this is the box's actual accessible name (pinned in params-deck.ct.tsx by role+name,
                  which is red against the Field anatomy above). */}
              <Input aria-label="Add stop sequence" onKeyDown={add} placeholder="add…" />
            </Row>
          </Fieldset>
        );
      }}
    </form.AppField>
  );
}
