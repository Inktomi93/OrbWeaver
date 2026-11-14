// One typed input per declared plugin command argument, for the `pluginCommandArgs` modal. The modal's commit, which
// holds the values and runs the command, is `hooks/use-plugin-command-args-commit.tsx`.

import type { PluginCommandArgSpec } from "@orb/contracts/plugin";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import type { ReactElement, RefObject } from "react";
import { humanizeId } from "../lib/plugin-command-copy.ts";

/** The two controls an argument's form can put focus on: the text or number box, and the switch or select trigger. The first
 *  argument is handed these so arrival lands on it; the other arguments are given none. */
export interface LandingRefs {
  readonly input: RefObject<HTMLInputElement | null>;
  readonly button: RefObject<HTMLButtonElement | null>;
}

/** The arg's visible label — its name read as words, with a required marker so a person knows what blocks the run. */
function argLabel(spec: PluginCommandArgSpec): string {
  const label = humanizeId(spec.name);
  return spec.required === true ? `${label} *` : label;
}

/** ONE typed input for one declared arg. The `type` dispatch is exhaustive (an if-chain the final `string` arm
 *  closes, doubling as the forward-compat fallback), each rendered through the house form primitive the surface
 *  renderer already uses. Values flow as strings into the shared bag. */
export function ArgInput({
  spec,
  value,
  onChange,
  landing,
}: {
  readonly spec: PluginCommandArgSpec;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly landing: LandingRefs | undefined;
}): ReactElement {
  if (spec.type === "boolean") {
    return (
      <Field description={spec.describe} label={argLabel(spec)} orientation="horizontal">
        <Switch
          checked={value === "true"}
          onCheckedChange={(next): void => onChange(String(next))}
          {...(landing === undefined ? {} : { ref: landing.button })}
        />
      </Field>
    );
  }
  if (spec.type === "number") {
    return (
      <Field description={spec.describe} label={argLabel(spec)}>
        <NumberField
          aria-label={humanizeId(spec.name)}
          {...(landing === undefined ? {} : { inputRef: landing.input })}
          onValueChange={(next): void => onChange(next === null ? "" : String(next))}
          value={value === "" ? null : Number(value)}
        />
      </Field>
    );
  }
  if (spec.type === "enum") {
    return (
      <Field description={spec.describe} label={argLabel(spec)}>
        {/* The `aria-label` STAYS, for a DIFFERENT reason than the Switch above (#1632 item 1, refusing a
            sweep that read this as the Input arm's twin): it is dead on the TRIGGER — the Field's
            `aria-labelledby` outranks it, measured per family —
            but `select.tsx`'s hidden-input effect sources that input's ONLY name from this attribute and
            falls back to the literal "Hidden select value". Dropping it trades a real name for a generic one
            on an element axe scans. The primitive's header states the rule; this site cites it. */}
        <Select
          aria-label={humanizeId(spec.name)}
          items={spec.enumValues.map((option) => ({ label: humanizeId(option), value: option }))}
          onValueChange={(next: string | null): void => onChange(next ?? "")}
          value={value}
          {...(landing === undefined ? {} : { triggerRef: landing.button })}
        />
      </Field>
    );
  }
  return (
    <Field description={spec.describe} label={argLabel(spec)}>
      {/* No `aria-label` (#1587): the Field's label reaches this control through Base UI's `aria-labelledby`,
          which outranks it, so `spec.name` named nothing — the cell announces `argLabel(spec)`, the visible
          label including the required marker, which is the richer of the two anyway. */}
      <Input onValueChange={onChange} value={value} {...(landing === undefined ? {} : { ref: landing.input })} />
    </Field>
  );
}
