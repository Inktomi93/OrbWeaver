// The `pluginCommandArgs` modal's BODY (#791 — the typed-arg grammar's palette half). When a command that
// DECLARES args is picked from the command palette, this collects one TYPED input per declared arg before the
// dispatch runs. One input per arg type: string→Input, number→NumberField, enum→Select, boolean→Switch — the
// SAME house primitives the plugin surface renderer uses for its form leaves, so a plugin's command args look like
// its panels. Values are collected as strings (what a form control yields) and coerced through the ONE contracts
// coercion (`coercePluginCommandArgs`) on submit; a missing-required / non-number / off-enum value blocks the
// dispatch with the exact sentence rather than sending the guest a lie. The composer collects the same args inline
// (`name=value`), so both surfaces flow through the SAME validate → run path.

import type { PluginCommandArgSpec } from "@orb/contracts/plugin";
import { coercePluginCommandArgs } from "@orb/contracts/plugin";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { clearPluginCommandArgs, closeModal, usePluginCommandArgsSubject } from "#state";
import { usePluginCommandRunner } from "../hooks/use-plugin-commands.ts";

/** The initial string bag: booleans default to `"false"` (an unchecked toggle IS a value, not an omission);
 *  everything else starts empty (a required one blocks submit until filled, an optional one is dropped). */
function initialValues(specs: readonly PluginCommandArgSpec[]): Record<string, string> {
  const seed: Record<string, string> = {};
  for (const spec of specs) {
    if (spec.type === "boolean") {
      seed[spec.name] = "false";
    }
  }
  return seed;
}

/** The arg's visible label — its name, with a required marker so a person knows what blocks the run. */
function argLabel(spec: PluginCommandArgSpec): string {
  return spec.required === true ? `${spec.name} *` : spec.name;
}

/** ONE typed input for one declared arg. The `type` dispatch is exhaustive (an if-chain the final `string` arm
 *  closes, doubling as the forward-compat fallback), each rendered through the house form primitive the surface
 *  renderer already uses. Values flow as strings into the shared bag. */
function ArgInput({
  spec,
  value,
  onChange,
}: {
  readonly spec: PluginCommandArgSpec;
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  if (spec.type === "boolean") {
    return (
      <Field description={spec.describe} label={argLabel(spec)} orientation="horizontal">
        <Switch checked={value === "true"} onCheckedChange={(next): void => onChange(String(next))} />
      </Field>
    );
  }
  if (spec.type === "number") {
    return (
      <Field description={spec.describe} label={argLabel(spec)}>
        <NumberField
          aria-label={spec.name}
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
            `aria-labelledby` outranks it, measured in `tests/client/a11y/field-control-name.suite.ct.tsx` —
            but `select.tsx`'s hidden-input effect sources that input's ONLY name from this attribute and
            falls back to the literal "Hidden select value". Dropping it trades a real name for a generic one
            on an element axe scans. The primitive's header states the rule; this site cites it. */}
        <Select
          aria-label={spec.name}
          items={(spec.enumValues ?? []).map((option) => ({ label: option, value: option }))}
          onValueChange={(next: string | null): void => onChange(next ?? "")}
          value={value}
        />
      </Field>
    );
  }
  return (
    <Field description={spec.describe} label={argLabel(spec)}>
      {/* No `aria-label` (#1587): the Field's label reaches this control through Base UI's `aria-labelledby`,
          which outranks it, so `spec.name` named nothing — the cell announces `argLabel(spec)`, the visible
          label including the required marker, which is the richer of the two anyway. */}
      <Input onValueChange={onChange} value={value} />
    </Field>
  );
}

export function PluginCommandArgsBody(): ReactElement {
  const subject = usePluginCommandArgsSubject();
  const run = usePluginCommandRunner(subject?.chatId ?? null);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(subject?.args ?? []));
  const [errors, setErrors] = useState<readonly string[]>([]);

  if (subject === undefined) {
    // The subject was cleared out from under an open modal — nothing to collect. The def's `onClose` normally
    // clears on dismissal, so this arm is only reached transiently.
    return <Text voice="gloss">No command selected.</Text>;
  }

  const setValue = (name: string, next: string): void => setValues((prev) => ({ ...prev, [name]: next }));

  const onSubmit = (): void => {
    const coerced = coercePluginCommandArgs(subject.args, values);
    if (coerced.errors.length > 0) {
      setErrors(coerced.errors);
      return;
    }
    // The raw `args` remainder is empty on the palette path (the person filled fields, not a `name=value` line);
    // the TYPED bag carries the arguments. The runner re-resolves the command and the server re-validates.
    run(subject.slug, subject.name, "", coerced.values);
    closeModal();
    clearPluginCommandArgs();
  };

  return (
    <Stack
      data-slot="plugin-command-args"
      gap="block"
      onKeyDown={(event): void => {
        // Enter submits from any field (the house form convention) — a modal-scale form should not need a reach
        // to the button. Shift+Enter and a composing IME are left alone.
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onSubmit();
        }
      }}
    >
      <Text voice="gloss">{subject.describe}</Text>
      <Stack gap="field">
        {subject.args.map((spec) => (
          <ArgInput key={spec.name} onChange={(next): void => setValue(spec.name, next)} spec={spec} value={values[spec.name] ?? ""} />
        ))}
      </Stack>
      {errors.length === 0 ? null : (
        <Stack gap="tight" role="alert">
          {errors.map((message) => (
            <Text className="text-destructive" key={message} voice="label">
              {message}
            </Text>
          ))}
        </Stack>
      )}
      <Row gap="field" justify="end">
        <Button intent="ghost" onClick={(): void => closeModal()} size="sm">
          Cancel
        </Button>
        <Button intent="primary" onClick={onSubmit} size="sm">
          Run {subject.name}
        </Button>
      </Row>
    </Stack>
  );
}
