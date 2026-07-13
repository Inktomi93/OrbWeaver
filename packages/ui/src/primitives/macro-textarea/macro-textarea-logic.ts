// Pure trigger/insert helpers for <MacroTextarea>: caret-walk that decides "are we inside a `{{…`
// macro context?" and the string/caret arithmetic that rewrites the value on pick — no DOM, no React state.

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

// We're in a `{{…` context when `{{` is found before `}}`/newline and the partial after it is macro-name chars.
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

// Parameterized macros (name contains `:`) insert a template with the caret just inside the closing
// braces so the user keeps typing the argument; non-parameterized macros insert the bare `{{name}}`.
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
