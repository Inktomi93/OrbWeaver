// The live-themed greeting bubble. `greetings[0]` (or the active alternate) renders through
// `@orb/ui/markdown` inside a `<ThemeScope>` painted with this character's own `themeOverride`. Alternates
// are in-bubble pill-tabs. "Edit" swaps the read-only preview for a `MacroTextarea` on the same field.
// The spoiler-blur eye toggle CSS-blurs the preview only — never the edit textarea.

import type { ThemeOverride } from "@orb/contracts/theme";
import { Button } from "@orb/ui/button";
import { Icon, Pencil, Plus, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { Markdown } from "@orb/ui/markdown";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { cn } from "#lib";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { CHARACTER_CARD_MACROS } from "../lib/character-card-macros";

type CardForm = AppFormInstance<CharacterCardFormValues>;

export interface CharacterGreetingPreviewProps {
  readonly form: CardForm;
  /** THIS character's raw theme override (immediate-commit — server truth) painting the preview scope;
   *  `null` ⇒ inherit the ambient theme. */
  readonly themeOverride: ThemeOverride | null;
  /** The resolved render-trust for this character's own content (§6.1 preview): `trustHtml === true`. */
  readonly trusted: boolean;
  /** §6.1 spoiler eye — blurs the preview text (never the edit textarea). */
  readonly spoilerBlur: boolean;
  /** The greeting the hero is previewing (drives the §6.5 total token count — lifted to the body). */
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
}

/** The greeting field path for the active alternate — the array-element key the TanStack Field binds. */
function greetingName(index: number): `greetings[${number}]` {
  return `greetings[${index}]`;
}

export function CharacterGreetingPreview(props: CharacterGreetingPreviewProps): ReactElement {
  const { form, activeIndex, onActiveIndexChange } = props;
  const [editing, setEditing] = useState(false);

  return (
    <form.Subscribe selector={(s): readonly string[] => s.values.greetings}>
      {(greetings): ReactElement => {
        // Clamp a stale active index (an alternate was just removed) — a render derivation, never an effect.
        const index = Math.min(activeIndex, Math.max(0, greetings.length - 1));
        return (
          <Stack gap="row" data-slot="character-greeting">
            <GreetingPills count={greetings.length} activeIndex={index} onSelect={onActiveIndexChange} />
            <GreetingBody {...props} index={index} editing={editing} />
            <GreetingActions
              form={form}
              index={index}
              greetingCount={greetings.length}
              editing={editing}
              onActiveIndexChange={onActiveIndexChange}
              onToggleEdit={(): void => setEditing((e) => !e)}
              onStartAlternate={(nextIndex): void => {
                onActiveIndexChange(nextIndex);
                setEditing(true);
              }}
            />
          </Stack>
        );
      }}
    </form.Subscribe>
  );
}

/** The "Opening 1 / 2 / …" in-bubble pill-tabs (rendered only for a multi-greeting card). */
function GreetingPills({
  count,
  activeIndex,
  onSelect,
}: {
  readonly count: number;
  readonly activeIndex: number;
  readonly onSelect: (index: number) => void;
}): ReactElement | null {
  if (count <= 1) {
    return null;
  }
  return (
    <Row gap="field" align="center" className="flex-wrap">
      {Array.from({ length: count }, (_, i) => (
        <Button
          // biome-ignore lint/suspicious/noArrayIndexKey: greetings are positional alternates with no stable id (an ST card array) — the index IS the identity (§6.1 "Opening N").
          key={i}
          type="button"
          size="sm"
          intent={i === activeIndex ? "secondary" : "ghost"}
          onClick={(): void => onSelect(i)}
        >
          Opening {i + 1}
        </Button>
      ))}
    </Row>
  );
}

/** The preview (themed Markdown, spoiler-aware) OR the raw edit textarea + token counter for one greeting. */
function GreetingBody({
  form,
  themeOverride,
  trusted,
  spoilerBlur,
  index,
  editing,
}: CharacterGreetingPreviewProps & {
  readonly index: number;
  readonly editing: boolean;
}): ReactElement {
  if (editing) {
    return (
      <Stack gap="field">
        <form.Field name={greetingName(index)}>
          {(field): ReactElement => (
            <MacroTextarea
              aria-label={`Opening ${index + 1}`}
              value={field.state.value}
              onChange={(next): void => field.handleChange(next)}
              onBlur={field.handleBlur}
              suggestions={CHARACTER_CARD_MACROS}
              rows={5}
              placeholder="The character's first message…"
            />
          )}
        </form.Field>
      </Stack>
    );
  }
  return (
    <form.Subscribe selector={(s): string => s.values.greetings[index] ?? ""}>
      {(active): ReactElement => (
        <ThemeScope tokens={themeOverride ?? {}}>
          <Stack gap="row" className={cn("rounded-card bg-ai-bubble p-block", spoilerBlur && "select-none blur-md")} data-slot="character-greeting-bubble">
            {active.trim() === "" ? (
              <Text tone="muted">No first message yet.</Text>
            ) : (
              <Markdown trust={trusted ? "trusted" : "untrusted"} mode="static">
                {active}
              </Markdown>
            )}
          </Stack>
        </ThemeScope>
      )}
    </form.Subscribe>
  );
}

/** Add-opening / remove-alternate / edit-toggle row. */
function GreetingActions({
  form,
  index,
  greetingCount,
  editing,
  onActiveIndexChange,
  onToggleEdit,
  onStartAlternate,
}: {
  readonly form: CardForm;
  readonly index: number;
  readonly greetingCount: number;
  readonly editing: boolean;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onToggleEdit: () => void;
  readonly onStartAlternate: (nextIndex: number) => void;
}): ReactElement {
  return (
    <Row gap="field" align="center" className="justify-end">
      {editing && index > 0 ? (
        <Button
          type="button"
          size="sm"
          intent="ghost"
          onClick={(): void => {
            void form.removeFieldValue("greetings", index);
            // Array structural mutations don't fire the autosave onChange listener (§7 TRAP) — flush
            // explicitly so a removed alternate actually persists.
            void form.handleSubmit();
            onActiveIndexChange(Math.max(0, index - 1));
          }}
        >
          <Icon icon={Trash2} size="sm" />
          Remove opening
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        intent="ghost"
        onClick={(): void => {
          form.pushFieldValue("greetings", "");
          // Structural push doesn't fire the autosave onChange listener (§7 TRAP) — flush explicitly
          // so the new slot persists; the editor then autosaves its content on the first keystroke.
          void form.handleSubmit();
          onStartAlternate(greetingCount);
        }}
      >
        <Icon icon={Plus} size="sm" />
        Add opening
      </Button>
      <Button type="button" size="sm" intent={editing ? "secondary" : "ghost"} aria-pressed={editing} onClick={onToggleEdit}>
        <Icon icon={Pencil} size="sm" />
        {editing ? "Done" : "Edit"}
      </Button>
    </Row>
  );
}
