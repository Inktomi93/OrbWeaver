// The bulk AXES picker (REGX2 · D2): what the selected scripts change and when they run, applied to the whole
// selection and replacing each one's own. The same two questions the per-script editor asks, with the same words and
// the same four-way "When it runs" choice (`../lib/regex-when.ts`), so a bulk edit can store nothing the editor could
// not.
//
// APPLY IS BLOCKED UNTIL BOTH ARE SET, unlike the autosaving editor, which allows (and warns about) an empty axis. A
// bulk Apply is a deliberate act, and "set every one of these to run nowhere" is never what it means. Depth and the
// author scope are not offered: they are per-script choices, and an on-screen or in-prompt result keeps each
// script's own. A when-saved result clears them (a saved change has neither), so the hint warns before Apply and
// the bulk bar names the cleared scripts after.
//
// It lives in a COMPONENT (the bulk bar mounts it), so its interior Dialog is legal (`orb/surface-consumes-container`: a surface
// renders no outer Dialog; a component owning its own interior one is fine — the `character-bulk-bar` shape).

import type { RegexPass, RegexTarget } from "@orb/kit/regex";
import { REGEX_TARGETS } from "@orb/kit/regex";
import { Field } from "@orb/ui/field";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import { DIALOG_VERBS, REGEX_TARGET_ITEMS, regexPassesRead } from "#lib";
import { REGEX_TARGETS_FIELD_NAME, REGEX_WHEN_FIELD_NAME } from "../lib/regex-names.ts";
import type { RegexWhenChoice } from "../lib/regex-when.ts";
import { regexUnreadTargetsNote, regexWhenItems, regexWhenPasses } from "../lib/regex-when.ts";

export interface RegexBulkAxesDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** How many scripts the apply targets — named in the copy the reader can no longer see behind the dialog. */
  readonly count: number;
  /** Fires with the chosen axes (targets in the kit's order) on Apply; the dialog closes itself after. */
  readonly onApply: (axes: { readonly targets: RegexTarget[]; readonly passes: RegexPass[] }) => void;
}

/** "1 script" / "3 scripts" — the subject the copy names (kept local; the bar owns its own copy of the same). */
function scriptCount(n: number): string {
  return `${String(n)} script${n === 1 ? "" : "s"}`;
}

/** Filtering through the tuple both validates the toggle's strings and fixes the order, so click order never
 *  reaches the wire. */
function toTargets(selected: readonly string[]): RegexTarget[] {
  return REGEX_TARGETS.filter((member) => selected.includes(member));
}

/** One always-true line under the controls: what is still missing, or what the choice leaves unread. */
function axesHint(targets: readonly RegexTarget[], choice: RegexWhenChoice | null): string {
  if (targets.length === 0 || choice === null) {
    return "Pick the text and when it runs. Leaving either empty would leave these running nowhere.";
  }
  if (choice === "save") {
    return "Changing these to run when saved clears each one's depth range and whose-messages lists, since a saved change has neither.";
  }
  return regexUnreadTargetsNote(targets, regexWhenPasses(choice)) ?? `Applies to ${targets.length === 1 ? "this text" : "these texts"} at this time.`;
}

export function RegexBulkAxesDialog({ open, onOpenChange, count, onApply }: RegexBulkAxesDialogProps): ReactElement {
  const [selected, setSelected] = useState<string[]>([]);
  const [choice, setChoice] = useState<RegexWhenChoice | null>(null);
  const targets = toTargets(selected);
  const whenItems = regexWhenItems(targets);
  // A choice the targets have since disabled is no choice: it would read none of them.
  const usable = choice !== null && whenItems.some((item) => item.value === choice && !item.disabled) ? choice : null;
  const ready = targets.length > 0 && usable !== null;

  const reset = (): void => {
    setSelected([]);
    setChoice(null);
  };

  return (
    <FormDialog
      description={`Choose what these scripts change and when. Applies to ${scriptCount(count)}, replacing each one's own.`}
      onOpenChange={(next): void => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      open={open}
      submit={{
        label: DIALOG_VERBS.apply,
        onSubmit: (): void => {
          if (usable !== null && targets.length > 0) {
            onApply({ targets, passes: regexWhenPasses(usable) });
            reset();
            onOpenChange(false);
          }
        },
        disabled: !ready,
      }}
      title="What these scripts change and when"
    >
      <Stack gap="field">
        <Field label={REGEX_TARGETS_FIELD_NAME}>
          {/* A ToggleGroup is not a Field control, so the group carries its own name. */}
          <ToggleGroup aria-label={REGEX_TARGETS_FIELD_NAME} multiple={true} onValueChange={setSelected} value={selected}>
            {REGEX_TARGET_ITEMS.map((item) => (
              <Toggle
                aria-label={item.label}
                disabled={usable !== null && !selected.includes(item.value) && !regexPassesRead(regexWhenPasses(usable), item.value)}
                key={item.value}
                value={item.value}
                variant="outline"
              >
                {item.label}
              </Toggle>
            ))}
          </ToggleGroup>
        </Field>
        <Field label={REGEX_WHEN_FIELD_NAME}>
          <Select<RegexWhenChoice>
            aria-label={REGEX_WHEN_FIELD_NAME}
            items={whenItems}
            onValueChange={setChoice}
            placeholder="Pick when they run"
            value={usable}
          />
        </Field>
        <Text aria-live="polite" voice="gloss">
          {axesHint(targets, usable)}
        </Text>
      </Stack>
    </FormDialog>
  );
}
