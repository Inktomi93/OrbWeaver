// The `pluginCommandArgs` modal's COMMIT. When a command that DECLARES args is picked from the command palette, this
// collects one TYPED input per declared arg before the dispatch runs; the run is the submit ModalHost draws after
// Cancel. Values are collected as strings (what a form control yields) and coerced through the ONE contracts coercion
// (`coercePluginCommandArgs`) on submit; a missing-required / non-number / off-enum value blocks the dispatch with the
// exact sentence rather than sending the guest a lie. The composer collects the same args inline (`name=value`), so both
// surfaces flow through the SAME validate → run path.

import type { PluginCommandArgSpec } from "@orb/contracts/plugin";
import { coercePluginCommandArgs } from "@orb/contracts/plugin";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useEffect, useRef, useState } from "react";
import type { ModalCommit } from "#state";
import { clearPluginCommandArgs, closeModal, usePluginCommandArgsSubject } from "#state";
import type { LandingRefs } from "../components/plugin-command-args-body.tsx";
import { ArgInput } from "../components/plugin-command-args-body.tsx";
import { PLUGIN_COMMAND_ARGS_TITLE, PLUGIN_NO_COMMAND_SELECTED_TEXT, pluginCommandActionLabel, pluginCommandAttribution } from "../lib/plugin-command-copy.ts";
import { usePluginCommandRunner, usePluginCommands } from "./use-plugin-commands.ts";

/** The initial string bag: a declared `default` opens preselected; otherwise booleans start `"false"` (an
 *  unchecked toggle IS a value, not an omission) and everything else starts empty (a required one blocks submit
 *  until filled, an optional one is dropped). */
function initialValues(specs: readonly PluginCommandArgSpec[]): Record<string, string> {
  const seed: Record<string, string> = {};
  for (const spec of specs) {
    if (spec.default !== undefined) {
      seed[spec.name] = String(spec.default);
    } else if (spec.type === "boolean") {
      seed[spec.name] = "false";
    }
  }
  return seed;
}

export function usePluginCommandArgsCommit(): ModalCommit {
  const subject = usePluginCommandArgsSubject();
  const { run } = usePluginCommandRunner(subject?.chatId ?? null);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(subject?.args ?? []));
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const commands = usePluginCommands();
  // Arrival lands on the first argument, so a command's values are typed straight away.
  const firstInputRef = useRef<HTMLInputElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (firstInputRef.current ?? firstButtonRef.current)?.focus();
  }, []);
  const landing: LandingRefs = { input: firstInputRef, button: firstButtonRef };

  const onSubmit = (): void => {
    if (subject === undefined) {
      return;
    }
    const coerced = coercePluginCommandArgs(subject.args, values);
    if (coerced.errors.length > 0) {
      setErrors(coerced.errors);
      return;
    }
    // The raw `args` remainder is empty on the palette path (the person filled fields, not a `name=value` line);
    // the TYPED bag carries the arguments. The runner re-resolves the command and the server re-validates.
    setErrors([]);
    setSubmitting(true);
    run({ slug: subject.slug, name: subject.name, args: "", values: coerced.values }, (succeeded): void => {
      setSubmitting(false);
      if (succeeded) {
        closeModal();
        clearPluginCommandArgs();
      }
    });
  };

  if (subject === undefined) {
    // The subject was cleared out from under an open modal — nothing to collect. The def's `onClose` normally
    // clears on dismissal, so this arm is only reached transiently, and its submit stays off.
    return {
      submit: { label: PLUGIN_COMMAND_ARGS_TITLE, disabled: true, onSubmit },
      content: <Text voice="gloss">{PLUGIN_NO_COMMAND_SELECTED_TEXT}</Text>,
    };
  }

  const setValue = (name: string, next: string): void => setValues((prev) => ({ ...prev, [name]: next }));
  const command = commands.find((candidate) => candidate.pluginId === subject.pluginId && candidate.name === subject.name);
  const attribution = pluginCommandAttribution(command?.pluginName ?? subject.slug, subject.slug);

  return {
    submit: { label: pluginCommandActionLabel(subject.name), loading: submitting, onSubmit },
    content: (
      <Stack
        data-slot="plugin-command-args"
        gap="block"
        onKeyDown={(event): void => {
          // Enter submits from any field, a switch and a select trigger included, where the form's own implicit submission
          // does not reach. Shift+Enter and a composing IME are left alone.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!submitting) {
              onSubmit();
            }
          }
        }}
      >
        <Text voice="gloss">{subject.describe}</Text>
        <Text voice="gloss">From {attribution}</Text>
        <Stack gap="field">
          {subject.args.map((spec, index) => (
            <ArgInput
              key={spec.name}
              landing={index === 0 ? landing : undefined}
              onChange={(next): void => setValue(spec.name, next)}
              spec={spec}
              value={values[spec.name] ?? ""}
            />
          ))}
        </Stack>
        {errors.length === 0 ? null : (
          <Stack gap="tight" role="alert">
            {errors.map((message) => (
              <Text tone="destructive" key={message} voice="label">
                {message}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    ),
  };
}
