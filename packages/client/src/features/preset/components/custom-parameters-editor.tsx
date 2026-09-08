// The `customParameters` EDITOR — the preset's provider escape hatch, authorable (D143a made the field live
// on the vLLM wire; before that it was import-only and this surface was a read-only presence row).
//
// The rows are the editing truth and the stored record is rebuilt from them on every keystroke, so a rename
// is a rename (row identity is the row's id, never its name) and the record's key order is the list's.
// An unfinished row still commits its slot — as the pending `undefined` marker `custom-parameters-model.ts`
// documents — which makes the form invalid and holds the autosave: the header reads "Not saved" instead of
// claiming a value that lives only in the box.
//
// THE BELT WARNING IS STATED AT AUTHORING TIME. The vLLM wire drops its belt-owned keys with a named warn on
// the turn (D143a); the list is `contracts/preset`'s, so this editor cannot promise a key the wire refuses.

import type { PromptConfig } from "@orb/contracts/preset";
import { isVllmBeltOwnedParameterKey } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Icon, Plus, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms/editor";
import type { CustomParameterRow } from "../lib/custom-parameters-model.ts";
import { customParameterRecord, customParameterRowError, customParameterRows, newCustomParameterRow } from "../lib/custom-parameters-model.ts";

/** What the wire does with this blob, stated where it is authored (D143a): two backends send it verbatim,
 *  one ignores it and says so on the turn. */
const SCOPE_GLOSS =
  "Extra fields merged into the request body — the door for samplers this app doesn't model (DRY, XTC, mirostat). Sent verbatim on a Local vLLM or Custom OpenAI-compatible connection; OpenRouter ignores them and says so on the turn.";
const PRECEDENCE_GLOSS = "On the local engine a name we already model — temperature, max_tokens — keeps the value the knobs above resolved.";
const EMPTY_GLOSS = "No custom parameters on this preset.";

/** The belt drop, per row. Named at edit time because the alternative is learning it from a turn warning. */
function beltGloss(key: string): string {
  return `The local engine owns ${key} — it is dropped from a vLLM request (the turn reports it). It still rides a Custom OpenAI-compatible connection.`;
}

export interface CustomParametersEditorProps {
  readonly form: AppFormInstance<PromptConfig>;
}

/**
 * THE EDITOR IS SUBSCRIBED TO ITS OWN FIELD, and that is the whole of the #1520 item-1 fix.
 *
 * The rows used to be seeded ONCE, on the reasoning that "the session boundary remounts this subtree on an
 * entity switch or a reseed, so the seed is re-taken exactly when the server row underneath actually
 * changes". That is TRUE OF A SWITCH and FALSE OF A RESET — the ruling survives, its input changed. An
 * entity switch bumps `create-autosave-entity-form.tsx`'s remount key, so the seed really is re-taken; the
 * clean server-echo RESET pushes the new truth in with `form.setFieldValue` field by field on the
 * STILL-MOUNTED form, which remounts nothing. So after a reset these rows still held the pre-reset values,
 * and the next add/remove/edit rebuilt the whole record from them — writing the stale parameters back over
 * the freshly-reset server value, plus that one edit.
 *
 * The subscription is what makes the change VISIBLE to this subtree at all (nothing here re-rendered on a
 * `setFieldValue` before), and the body reseeds on it.
 *
 * AND IT IS NOT THE #1561 TWO-WRITER ARM, which #1588 read it as (measured 2026-09-05, three fences in
 * `params-deck.ct.tsx`). A reseed cannot discard visible keystrokes here because the ONE writer that moves
 * this field on a still-mounted form — `create-autosave-entity-form.tsx`'s clean server-echo effect — is
 * gated on `saveState !== "saving" && !hasUnsavedEdits(...)`, and every keystroke in this editor goes
 * through `commit()` → `form.setFieldValue`, so typing is exactly what closes that gate. The value the rows
 * are reseeded FROM therefore only moves while there is nothing unsaved to lose. Routing this through
 * `lib/edit-session.ts`'s `resolveCommit` (the tracker / beat-row / roster shape) would be a SECOND, weaker
 * copy of a decision the form already owns, and it would have to refuse the reset case above.
 */
export function CustomParametersEditor({ form }: CustomParametersEditorProps): ReactElement {
  return (
    <form.Subscribe selector={(state): PromptConfig["customParameters"] => state.values.customParameters}>
      {(stored): ReactElement => <CustomParametersBody form={form} stored={stored} />}
    </form.Subscribe>
  );
}

/** Is `stored` the record these rows already represent? Deliberately a CONTENT comparison and not an
 *  identity one: `commit` sets the field from `customParameterRecord(rows)`, so our own write always
 *  produces a fresh object that means exactly what the rows already say — reseeding on it would destroy row
 *  identity (a rename would become a delete + add) and drop the pending, not-yet-valid rows the model keeps
 *  as `undefined` markers. Key order is the list's by construction on both sides, so the serialisation is
 *  stable for the one comparison this needs to make. */
function sameStoredParameters(stored: PromptConfig["customParameters"], fromRows: PromptConfig["customParameters"]): boolean {
  return JSON.stringify(stored) === JSON.stringify(fromRows);
}

function CustomParametersBody({
  form,
  stored,
}: {
  readonly form: AppFormInstance<PromptConfig>;
  readonly stored: PromptConfig["customParameters"];
}): ReactElement {
  const [rows, setRows] = useState<CustomParameterRow[]>(() => customParameterRows(stored));
  // The last field value this body has accounted for. Compared during render — the React-documented shape for
  // "a prop changed, so state derived from it must change too" — rather than in an effect, which would render
  // the stale rows for a frame and let a keystroke in that frame commit them.
  const [seen, setSeen] = useState<PromptConfig["customParameters"]>(stored);
  if (stored !== seen) {
    setSeen(stored);
    if (!sameStoredParameters(stored, customParameterRecord(rows))) {
      setRows(customParameterRows(stored));
    }
  }

  const commit = (next: readonly CustomParameterRow[]): void => {
    setRows([...next]);
    // `undefined` for an empty list — clearing the last row round-trips the field to unset, never `{}`.
    form.setFieldValue("customParameters", customParameterRecord(next));
  };

  return (
    <Stack gap="tight">
      <Text voice="label">Custom parameters</Text>
      <Text voice="gloss">{SCOPE_GLOSS}</Text>
      {rows.length === 0 ? <Text voice="gloss">{EMPTY_GLOSS}</Text> : <Text voice="gloss">{PRECEDENCE_GLOSS}</Text>}
      {rows.map((row, index) => (
        <ParameterRow
          error={customParameterRowError(rows, row)}
          index={index}
          key={row.id}
          onChange={(next): void => commit(rows.map((current) => (current.id === row.id ? next : current)))}
          onRemove={(): void => commit(rows.filter((current) => current.id !== row.id))}
          row={row}
        />
      ))}
      <Row>
        <Button intent="secondary" onClick={(): void => commit([...rows, newCustomParameterRow(rows)])} size="sm" type="button">
          <Icon icon={Plus} size="sm" />
          Add parameter
        </Button>
      </Row>
    </Stack>
  );
}

/** One row: the name, the JSON value, its refusal and its belt warning. The two cells are bare labelled
 *  Inputs rather than `Field`s — a Field's own Label wins the accessible name, which on a repeated row list
 *  would give every name cell the identical name. */
function ParameterRow({
  row,
  index,
  error,
  onChange,
  onRemove,
}: {
  readonly row: CustomParameterRow;
  readonly index: number;
  readonly error: string | undefined;
  readonly onChange: (next: CustomParameterRow) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const position = index + 1;
  const named = row.key.trim().length === 0 ? `parameter ${position}` : row.key;
  return (
    <Stack gap="tight">
      <Row align="center" gap="field">
        {/* BOTH cells flex and neither may push the door out: at the narrowest real mount (a 430px phone,
            coarse pointer) two intrinsically-sized inputs squeezed the remove door to 38.9px against a 44px
            floor. The cells shrink; the door does not. */}
        <Input
          aria-label={`Parameter ${position} name`}
          className="min-w-0 max-w-sm flex-1"
          onValueChange={(next): void => onChange({ ...row, key: next })}
          placeholder="top_a"
          value={row.key}
        />
        <Input
          aria-label={`Parameter ${position} value`}
          className="min-w-0 flex-1"
          onValueChange={(next): void => onChange({ ...row, text: next })}
          placeholder="0.1"
          value={row.text}
        />
        <Button aria-label={`Remove ${named}`} className="shrink-0" intent="ghost" onClick={onRemove} size="icon" type="button">
          <Icon icon={X} size="xs" />
        </Button>
      </Row>
      {error === undefined ? null : (
        <Text className="text-destructive" voice="gloss">
          {error}
        </Text>
      )}
      {isVllmBeltOwnedParameterKey(row.key) ? <Text voice="gloss">{beltGloss(row.key)}</Text> : null}
    </Stack>
  );
}
