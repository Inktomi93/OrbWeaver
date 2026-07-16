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

export function MacroTextareaStory(): ReactElement {
  const [value, setValue] = useState("");
  return <MacroTextarea aria-label="Body" onChange={setValue} suggestions={MACROS} value={value} />;
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
