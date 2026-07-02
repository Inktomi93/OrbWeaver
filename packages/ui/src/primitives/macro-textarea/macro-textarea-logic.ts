// ── macro-textarea-logic — pure trigger/insert helpers for <MacroTextarea> ──
//
// The caret-walk that decides "are we inside a `{{…` macro context?" and the string/caret
// arithmetic that rewrites the value when a macro is picked are pure functions of
// (text, caret, macroName) — no DOM, no React state. They live here so they can be unit-tested
// directly (the component wiring around them is exercised separately), and so the off-by-one
// caret math has a home where a test can pin it.
//
// Ported nearly verbatim from neo-tavern's macro-textarea-logic.ts — the trigger-detection and
// insertion arithmetic is domain-agnostic already (it never touched the macro catalog), so the
// port is a straight copy with its tests.

export interface MacroTrigger {
  /** Index of the `{{` in the value string. */
  start: number;
  /** The partial typed AFTER `{{`. */
  partial: string;
}

export interface MacroInsertion {
  /** The full new textarea value with the macro inserted. */
  next: string;
  /** Where the caret should land after React applies `next`. */
  caret: number;
}

// Macro-name chars allowed between `{{` and the caret — letters, digits, `_`, `.`, `:` (covers
// `getvar::pov`, `env.tense`). Top-level so it's compiled once, not per keystroke.
const MACRO_NAME_CHARS_RE = /^[A-Za-z0-9_.:]*$/u;

// Walk backward from the caret. We're in a `{{…` context when:
//   • we find `{{` before `}}` or a newline,
//   • the partial between `{{` and the caret contains only macro-name chars.
export function detectTrigger(text: string, caret: number): MacroTrigger | null {
  const head = text.slice(0, caret);
  const openIdx = head.lastIndexOf("{{");
  if (openIdx === -1) {
    return null;
  }
  const between = head.slice(openIdx + 2);
  if (between.includes("}}") || between.includes("\n")) {
    return null;
  }
  if (!MACRO_NAME_CHARS_RE.test(between)) {
    return null;
  }
  return { start: openIdx, partial: between };
}

// Replace the `{{partial` span at `trigger` with the macro's insert form and report the resulting
// caret. Parameterized macros (catalog name contains `:`, e.g. `getvar::name`) are templates:
// insert `{{getvar::}}` and drop the caret just inside the closing braces (after `::`) so the user
// keeps typing the argument. Non-parameterized macros insert the bare `{{name}}` with the caret
// after the closing braces.
export function computeMacroInsertion(
  value: string,
  trigger: MacroTrigger,
  macroName: string,
): MacroInsertion {
  const before = value.slice(0, trigger.start);
  const after = value.slice(trigger.start + 2 + trigger.partial.length);
  const isParameterized = macroName.includes(":");
  const inserted = isParameterized
    ? `{{${macroName.slice(0, macroName.indexOf(":"))}::}}`
    : `{{${macroName}}}`;
  const next = `${before}${inserted}${after}`;
  const caret = isParameterized
    ? before.length + inserted.length - 2 // before the closing `}}`
    : before.length + inserted.length;
  return { next, caret };
}
