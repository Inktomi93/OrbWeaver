// The SCOPE editor (the apply-and-selection mock, frame 1 — FORK G: a panel over CONTENT): which card
// content rides the pipeline. The field list is `REFINABLE_FIELDS` VERBATIM in canonical-card order; the
// greetings row is a TRI-STATE parent with a per-slot list under it (orb greetings are ONE
// index-addressable array). LAW: an all-checked greetings parent saves as ABSENT `greetingIndexes`
// (absent = every greeting, so a slot added later stays in scope). A card with no depth note renders a
// DISABLED depthPrompt row (a checkbox that leads to a `not_applicable` drop is a trap). Empty fields
// stay selectable (§7c — emptiness is a scoreable state). FORK F: "Reset to populated" + the
// "Select what scored under 7" sibling once a score run exists.

import type { CharacterCard } from "@orb/contracts/character";
import type { RefinableField, RefineryScorePayload, RefinerySelection } from "@orb/contracts/refinery";
import { REFINABLE_FIELDS } from "@orb/contracts/refinery";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";

export interface ScopeEditorDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly card: CharacterCard;
  readonly selection: RefinerySelection;
  /** The latest score payload when one exists — powers the FORK-F quality action. */
  readonly score: RefineryScorePayload | null;
  readonly onSave: (selection: RefinerySelection) => void;
}

const LOW_SCORE_BAR = 7;

function fieldTextOf(card: CharacterCard, field: Exclude<RefinableField, "greetings">): string | null {
  switch (field) {
    case "description":
      return card.description;
    case "personality":
      return card.personality;
    case "scenario":
      return card.scenario;
    case "exampleMessages":
      return card.exampleMessages;
    case "systemPrompt":
      return card.systemPrompt;
    case "postHistoryInstructions":
      return card.postHistoryInstructions;
    case "depthPrompt":
      return card.depthPrompt?.prompt ?? null;
    case "creatorNotes":
      return card.creatorNotes;
    default: {
      const never: never = field;
      throw new Error(`unreachable field ${String(never)}`);
    }
  }
}

function populatedSelection(card: CharacterCard): RefinerySelection {
  return {
    fields: REFINABLE_FIELDS.filter((f) => (f === "greetings" ? card.greetings.some((g) => g.text.length > 0) : (fieldTextOf(card, f) ?? "").length > 0)),
  };
}

function fieldGlossOf(depthless: boolean, text: string | null): string {
  if (depthless) {
    return "no depth note on this card";
  }
  if (text === null || text.length === 0) {
    return "empty — still scoreable";
  }
  return `${text.length} chars`;
}

/** A scope row: the checkbox, its NAME, and its gloss — all inside one real `<label>` (side-eye
 *  2026-08-09 P1-9). Twelve bare `<Checkbox>` controls sat beside sibling `<Text>` nodes, so every one
 *  of them had NO accessible name (a screen reader read twelve unlabelled checkboxes) and an 18px hit
 *  target far under the touch floor. Wrapping in a label fixes both at once: the association gives the
 *  name, and the whole row becomes the target. `Field` is the primitive that owns this pairing — it
 *  renders the real label element and wires the control's id, which a hand-rolled `<label>` in a
 *  feature could not do without reaching for a raw intrinsic. */
function ScopeCheckRow({
  checked,
  disabled = false,
  indeterminate = false,
  gloss,
  name,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  gloss: string;
  name: string;
  onToggle: () => void;
}): ReactElement {
  return (
    <Field className="w-full" label={name} orientation="horizontal">
      <Row align="center" gap="row">
        <Checkbox checked={checked} disabled={disabled} indeterminate={indeterminate} onCheckedChange={onToggle} />
        <Text voice="gloss">{gloss}</Text>
      </Row>
    </Field>
  );
}

function GreetingsScopeRow({
  card,
  on,
  greetingIndexes,
  onToggleField,
  onToggleGreeting,
}: {
  card: CharacterCard;
  on: boolean;
  greetingIndexes: readonly number[] | undefined;
  onToggleField: () => void;
  onToggleGreeting: (index: number) => void;
}): ReactElement {
  const selectedCount = greetingIndexes?.length ?? card.greetings.length;
  return (
    <Stack gap="tight">
      <ScopeCheckRow
        checked={on}
        gloss={card.greetings.length === 0 ? "no greetings" : `${on ? selectedCount : 0} of ${card.greetings.length} slots selected`}
        indeterminate={on && greetingIndexes !== undefined && greetingIndexes.length < card.greetings.length}
        name="greetings"
        onToggle={onToggleField}
      />
      {on
        ? card.greetings.map((g, i) => {
            const slotOn = greetingIndexes === undefined || greetingIndexes.includes(i);
            return (
              <ScopeCheckRow
                checked={slotOn}
                gloss={g.text.length > 0 ? g.text : "(empty)"}
                // biome-ignore lint/suspicious/noArrayIndexKey: the greeting INDEX is the slot's identity — the whole selection model (greetingIndexes) addresses by index.
                key={i}
                // The slot's name is its ADDRESS. "Greeting 0" (not "[0]") because the accessible name is
                // read aloud, and a bracketed index is not a sentence.
                name={`Greeting ${i}`}
                onToggle={(): void => onToggleGreeting(i)}
              />
            );
          })
        : null}
    </Stack>
  );
}

export function ScopeEditorDialog({ open, onOpenChange, card, selection, score, onSave }: ScopeEditorDialogProps): ReactElement {
  const [fields, setFields] = useState<readonly RefinableField[]>(selection.fields);
  // undefined = EVERY greeting (the contracts law the mock's law note pins).
  const [greetingIndexes, setGreetingIndexes] = useState<readonly number[] | undefined>(selection.greetingIndexes);

  function toggleField(field: RefinableField): void {
    setFields((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...REFINABLE_FIELDS.filter((f) => f === field || prev.includes(f))]));
  }

  function toggleGreeting(index: number): void {
    const current = greetingIndexes ?? card.greetings.map((_, i) => i);
    const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index].sort((a, b) => a - b);
    // All slots checked ⇒ save as ABSENT (the law note above).
    setGreetingIndexes(next.length === card.greetings.length ? undefined : next);
  }

  function selectUnderBar(): void {
    if (score === null) {
      return;
    }
    const low = new Set(score.fieldScores.filter((f) => f.score < LOW_SCORE_BAR).map((f) => f.field));
    const lowGreetings = score.fieldScores
      .filter((f) => f.field === "greetings" && f.score < LOW_SCORE_BAR && f.greetingIndex !== undefined)
      .map((f) => f.greetingIndex as number);
    setFields(REFINABLE_FIELDS.filter((f) => low.has(f)));
    setGreetingIndexes(lowGreetings.length === card.greetings.length ? undefined : lowGreetings);
  }

  return (
    <FormDialog onOpenChange={onOpenChange} open={open} size="md" title="Scope">
      <Stack gap="row">
        <Text voice="gloss">
          Only what you select is sent to the model — and only what you selected can ever be applied back. Widening the scope later re-runs the pipeline; it
          does not retro-fit an old rewrite.
        </Text>
        {REFINABLE_FIELDS.map((field) => {
          const on = fields.includes(field);
          if (field === "greetings") {
            return (
              <GreetingsScopeRow
                card={card}
                greetingIndexes={greetingIndexes}
                key={field}
                on={on}
                onToggleField={(): void => toggleField(field)}
                onToggleGreeting={toggleGreeting}
              />
            );
          }
          const text = fieldTextOf(card, field);
          const depthless = field === "depthPrompt" && card.depthPrompt === null;
          return (
            <ScopeCheckRow
              checked={on && !depthless}
              disabled={depthless}
              gloss={fieldGlossOf(depthless, text)}
              key={field}
              name={field}
              onToggle={(): void => toggleField(field)}
            />
          );
        })}
        <Row align="center" gap="row">
          <Button
            intent="ghost"
            onClick={(): void => {
              const populated = populatedSelection(card);
              setFields(populated.fields);
              setGreetingIndexes(undefined);
            }}
            size="sm"
          >
            Reset to populated
          </Button>
          {score !== null ? (
            <Button intent="ghost" onClick={selectUnderBar} size="sm">
              Select what scored under {LOW_SCORE_BAR}
            </Button>
          ) : null}
          <Row className="flex-1" gap="row" justify="end">
            <Button
              onClick={(): void => {
                onSave({ fields: [...fields], ...(greetingIndexes === undefined ? {} : { greetingIndexes: [...greetingIndexes] }) });
                onOpenChange(false);
              }}
              size="sm"
            >
              Save scope
            </Button>
          </Row>
        </Row>
      </Stack>
    </FormDialog>
  );
}
