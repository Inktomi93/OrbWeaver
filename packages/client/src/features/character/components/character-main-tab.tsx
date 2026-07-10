// The §6.3 Main tab (default) — the immersion-loud card content (DRAFT): description · personality ·
// scenario · exampleMessages · creatorNotes. All macro-aware. Every PROMPT-BEARING field carries a live
// below-field token counter (§6.3, off the draft via the ONE kit estimator); creatorNotes gets NONE (it
// never reaches the model). exampleMessages renders as a collapsed formatted mini-transcript — the parsed
// `<START>`-delimited blocks rendered read-only (§6.3's exact words) — with expand-to-edit swapping to the
// raw MacroTextarea on the SAME field (the stored string round-trips byte-identical; the parse is DISPLAY
// only, never the write path).
//
// SPOILER-BLUR (§6.1, screen-share hygiene): the eye toggle CSS-blurs the spoiler-bearing field containers
// at REST — description · personality · scenario · exampleMessages — so a streamed library isn't spoiled;
// the author toggles it OFF to author (blurred-while-editing being nonsensical is exactly why it's a
// toggle). View-state only (`useSpoilerBlur`), no transition (reduced-motion-safe), never touches the data.
//
// Long-text authoring fields stay VERTICAL (owner ruling 2026-07-09 #25 — horizontal FieldLayout is opt-in,
// for short label-left/control-right fields, which none of these are).

import { estimateTokens } from "@orb/kit/tokens";
import { Button } from "@orb/ui/button";
import { Section, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { useSpoilerBlur } from "#state";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { CHARACTER_CARD_MACROS } from "../lib/character-card-macros";
import { parseExampleBlocks } from "../lib/example-messages";
import { CharacterTokenCounter } from "./character-token-counter";

type CardForm = AppFormInstance<CharacterCardFormValues>;

/** The CSS-blur className for a spoiler-bearing field container when the eye toggle is on (§6.1). No
 *  transition → reduced-motion-safe by construction. `data-slot` locates the container for the CT. */
function spoilerClass(blur: boolean): string | undefined {
  return blur ? "select-none blur-md" : undefined;
}

export interface CharacterMainTabProps {
  readonly form: CardForm;
  /** §6.1 preview trust for this character's own example transcript (`trustHtml === true`). */
  readonly trusted: boolean;
}

export function CharacterMainTab({ form, trusted }: CharacterMainTabProps): ReactElement {
  const spoilerBlur = useSpoilerBlur();
  return (
    <Stack gap="section">
      <CountedMacroField
        form={form}
        name="description"
        label="Description"
        hint="Who they are — the core of the card. Use {{char}}/{{user}} to self-reference."
        spoilerBlur={spoilerBlur}
      />
      <CountedMacroField
        form={form}
        name="personality"
        label="Personality"
        hint="A summary of traits and temperament."
        spoilerBlur={spoilerBlur}
      />
      <CountedMacroField
        form={form}
        name="scenario"
        label="Scenario"
        hint="The setting or situation the chat opens in."
        spoilerBlur={spoilerBlur}
      />
      <ExampleMessagesField form={form} trusted={trusted} spoilerBlur={spoilerBlur} />
      <form.AppField name="creatorNotes">
        {(field): ReactElement => (
          <field.MacroField
            label="Creator notes"
            hint="Notes for humans — never sent to the model."
            suggestions={CHARACTER_CARD_MACROS}
            rows={3}
          />
        )}
      </form.AppField>
    </Stack>
  );
}

/** One macro-aware field + its live token counter (a prompt-bearing Main/Advanced text field). `name` is a
 *  literal key so the bound field + the counter subscribe stay type-checked against the form values. The
 *  whole container blurs at rest when the spoiler eye is on (§6.1). */
function CountedMacroField({
  form,
  name,
  label,
  hint,
  spoilerBlur,
}: {
  readonly form: CardForm;
  readonly name: "description" | "personality" | "scenario";
  readonly label: string;
  readonly hint: string;
  readonly spoilerBlur: boolean;
}): ReactElement {
  return (
    <Stack gap="field" data-slot="character-spoiler-field" className={spoilerClass(spoilerBlur)}>
      <form.AppField name={name}>
        {(field): ReactElement => (
          <field.MacroField
            label={label}
            hint={hint}
            suggestions={CHARACTER_CARD_MACROS}
            rows={6}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(s): string => s.values[name]}>
        {(value): ReactElement => <CharacterTokenCounter tokens={estimateTokens(value)} />}
      </form.Subscribe>
    </Stack>
  );
}

/** exampleMessages — a collapsed read-only formatted mini-transcript (the parsed `<START>`-delimited blocks,
 *  each rendered through Markdown; §6.3) with expand-to-edit swapping to the raw MacroTextarea on the SAME
 *  field (byte-identical round-trip — the parse is DISPLAY only). Blurs at rest under the spoiler eye. */
function ExampleMessagesField({
  form,
  trusted,
  spoilerBlur,
}: {
  readonly form: CardForm;
  readonly trusted: boolean;
  readonly spoilerBlur: boolean;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  return (
    <Section heading="Example messages">
      <Stack
        gap="field"
        data-slot="character-spoiler-field"
        className={editing ? undefined : spoilerClass(spoilerBlur)}
      >
        {editing ? (
          <form.AppField name="exampleMessages">
            {(field): ReactElement => (
              <field.MacroField
                label="Example messages"
                hint="Sample exchanges (ST <START> blocks) teaching the model the character's voice."
                suggestions={CHARACTER_CARD_MACROS}
                rows={8}
              />
            )}
          </form.AppField>
        ) : (
          <form.Subscribe selector={(s): string => s.values.exampleMessages}>
            {(value): ReactElement => <ExampleTranscript value={value} trusted={trusted} />}
          </form.Subscribe>
        )}
      </Stack>
      <form.Subscribe selector={(s): string => s.values.exampleMessages}>
        {(value): ReactElement => <CharacterTokenCounter tokens={estimateTokens(value)} />}
      </form.Subscribe>
      <Button
        type="button"
        size="sm"
        intent={editing ? "secondary" : "ghost"}
        aria-pressed={editing}
        onClick={(): void => setEditing((e) => !e)}
      >
        {editing ? "Done editing" : "Expand to edit"}
      </Button>
    </Section>
  );
}

/** The read-only formatted mini-transcript — one Markdown block per parsed `<START>` segment. */
function ExampleTranscript({
  value,
  trusted,
}: {
  readonly value: string;
  readonly trusted: boolean;
}): ReactElement {
  const blocks = parseExampleBlocks(value);
  if (blocks.length === 0) {
    return <Text tone="muted">No example messages yet.</Text>;
  }
  return (
    <Stack gap="block">
      {blocks.map((block, index) => (
        <Stack
          // biome-ignore lint/suspicious/noArrayIndexKey: example blocks are positional (an ST `<START>` array) with no stable id — the index IS the identity.
          key={index}
          gap="row"
          padding="field"
          className="rounded-card border border-border"
        >
          <Markdown trust={trusted ? "trusted" : "untrusted"} mode="static">
            {block}
          </Markdown>
        </Stack>
      ))}
    </Stack>
  );
}
