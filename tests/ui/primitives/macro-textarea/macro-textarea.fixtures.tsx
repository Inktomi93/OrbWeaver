// Story wrappers for macro-textarea CT (CT mounts from a non-test module). <MacroTextarea> is
// controlled, so every story owns the `value` state itself — the plain uncontrolled-looking usage
// a real consumer would write.
import { Field } from "@orb/ui/field";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import type { ReactElement } from "react";
import { useState } from "react";

// Not exported — `useComponentExportOnlyModules` requires a fixtures file to export components
// only; the stories below close over this catalog instead.
const MACROS: readonly MacroSuggestion[] = [
  { name: "char", category: "Character", description: "The character's name" },
  { name: "user", category: "Character", description: "The persona's name" },
  { name: "time", category: "System", description: "Current time" },
  {
    name: "getvar::name",
    category: "Variables",
    description: "Read a chat variable",
    args: ["name"],
  },
];

// A BLOCK entry: the row still reads `{{if}}` (name owns the label + the search index), but picking it
// inserts the whole pair via `insertTemplate`, caret at the `$0`.
const BLOCK_MACROS: readonly MacroSuggestion[] = [
  ...MACROS,
  { name: "if", category: "System", description: "Conditional block.", args: ["predicate?"], insertTemplate: "{{if::$0}}{{/if}}" },
];

export function MacroTextareaStory(): ReactElement {
  const [value, setValue] = useState("");
  return <MacroTextarea aria-label="Body" onChange={setValue} suggestions={MACROS} value={value} />;
}

/** The block-insertion shape: a suggestion whose acceptance must land BOTH tags, not a bare `{{if}}`. */
export function BlockSuggestionsStory(): ReactElement {
  const [value, setValue] = useState("");
  return <MacroTextarea aria-label="Body" onChange={setValue} suggestions={BLOCK_MACROS} value={value} />;
}

export function EmptySuggestionsStory(): ReactElement {
  const [value, setValue] = useState("");
  return <MacroTextarea aria-label="Body" onChange={setValue} suggestions={[]} value={value} />;
}

/**
 * R7 Field-composability: `<MacroTextarea>` composes `#primitives/textarea`'s `Field.Control`
 * registration, so wrapping it in a real `<Field label description>` — with NO explicit `id`
 * passed to `MacroTextarea` (the common caller shape) — must get label/`aria-describedby`
 * association for free. Catches the mergeProps id-override footgun (the color-field.tsx
 * precedent): a bare `id={id}` forwarded to the underlying control would silently erase the id
 * Field.Control auto-generates.
 */
export function FieldWrappedStory(): ReactElement {
  const [value, setValue] = useState("");
  return (
    <Field description="Type {{ to insert a macro" label="Body">
      <MacroTextarea onChange={setValue} suggestions={MACROS} value={value} />
    </Field>
  );
}

/**
 * The side-eye F-3 shape: a `<Field>`-labelled editor GHOSTING a 60-word factory default. This is the
 * exact composition that announced its whole template as the field's own accessible name (twice) while
 * `role="combobox"` was unconditional — the accname algorithm's combobox arm falls through to the value.
 */
export function GhostDefaultStory(): ReactElement {
  const [value, setValue] = useState("");
  return (
    <Field label="Template">
      <MacroTextarea
        onChange={setValue}
        placeholder="[Forget all other previous instructions. For this turn only, write in the {{person}}-person perspective AS {{user}} (not {{char}}). Limit yourself strictly to {{user}}'s voice and actions; do NOT narrate {{char}}'s reaction or the surrounding scene. Guidance: {{input}}]"
        rows={4}
        suggestions={MACROS}
        value={value}
      />
    </Field>
  );
}

/**
 * The CAPPED-EDITOR shape (side-eye PROSE-LIMIT P1): a field carrying a `maxLength` and a value long enough
 * to matter. `maxRows` must reach the underlying textarea through the wrapper — the whole defect was that a
 * capped-but-long value rendered as unbounded box height and pushed the counter/refusal under it off screen.
 */
export function CappedStory(): ReactElement {
  const [value, setValue] = useState("a paragraph that will certainly wrap several times over. ".repeat(60));
  return (
    <MacroTextarea
      aria-label="Body"
      helper="the footer this box must not push away"
      maxLength={4000}
      maxRows={6}
      onChange={setValue}
      rows={3}
      suggestions={MACROS}
      value={value}
    />
  );
}

/**
 * The R7 acceptance shape: `suggestions` is a NEW array reference every render (filtered/mapped
 * from state), while the parent re-renders — the real consumer shape, not a module-const stable
 * reference. Proves the fuzzy index rebuild-on-miss (keyed by array IDENTITY, not deep-equal)
 * doesn't break filtering when the identity churns.
 */
export function DerivedSuggestionsStory(): ReactElement {
  const [value, setValue] = useState("");
  const [bump, setBump] = useState(0);
  const rerender = (): void => setBump((n) => n + 1);
  const suggestions = MACROS.filter((m) => m.name.length > 0).map((m) => ({ ...m }));
  return (
    <div>
      <button data-testid="rerender" onClick={rerender} type="button">
        rerender {bump}
      </button>
      <MacroTextarea aria-label="Body" onChange={setValue} suggestions={suggestions} value={value} />
    </div>
  );
}
