import type { ChangeEvent, ClipboardEvent, CompositionEvent } from "react";

// Base UI reads a locale's group separator from the field's own format, and an ungrouped format renders none, so a typed
// or pasted "8,443" parses as 8. The seal strips the separator the locale itself groups with before Base UI sees the text,
// and only from text in full group shape: a lone "0.7" in a locale that groups with "." is left for Base UI to read as 0.7.

const SAMPLE = 11_111_111.1;
const NUMBER_SIGN = /^[+\-−]?/u;

interface Separators {
  /** The text pattern of the group separator, or null when the locale writes none. */
  readonly group: string | null;
  readonly decimal: string;
}

const known = new Map<string, Separators>();

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** The locale's separators, read from its formatter parts. */
function separatorsOf(locale: Intl.LocalesArgument): Separators {
  const key = JSON.stringify(locale ?? null);
  const cached = known.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(SAMPLE);
  const group = parts.find((part) => part.type === "group")?.value;
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  let pattern: string | null = null;
  if (group !== undefined) {
    if (/\p{Zs}/u.test(group)) {
      pattern = "\\p{Zs}";
    } else if (group === "'" || group === "’") {
      pattern = "['’]";
    } else {
      pattern = escaped(group);
    }
  }
  const found = { group: pattern, decimal };
  known.set(key, found);
  return found;
}

/** `text` with the locale's group separators removed, when its whole number part is 1-3 digits then groups of exactly three. */
export function stripGroupSeparators(text: string, locale: Intl.LocalesArgument): string {
  const { group, decimal } = separatorsOf(locale);
  if (group === null) {
    return text;
  }
  const shape = new RegExp(`^(${NUMBER_SIGN.source})(\\d{1,3}(?:${group}\\d{3})+)((?:${escaped(decimal)}\\d*)?)$`, "u");
  const match = shape.exec(text);
  if (match === null) {
    return text;
  }
  const [, sign = "", whole = "", fraction = ""] = match;
  return `${sign}${whole.replace(new RegExp(group, "gu"), "")}${fraction}`;
}

/** The input's change handler: removes group separators from the DOM text, keeping the caret, before Base UI reads it. */
export function stripTypedGroups(event: ChangeEvent<HTMLInputElement>, locale: Intl.LocalesArgument): void {
  // An IME composition is unfinished text; `stripComposedGroups` settles it at composition end.
  if (event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing) {
    return;
  }
  const input = event.currentTarget;
  const raw = input.value;
  const next = stripGroupSeparators(raw, locale);
  if (next === raw) {
    return;
  }
  const caret = input.selectionStart ?? raw.length;
  const caretAfter = Math.max(0, caret - (raw.length - next.length));
  input.value = next;
  input.setSelectionRange(caretAfter, caretAfter);
}

/** The composition-end handler: a settled composition holding grouped digits is rewritten and handed to Base UI as input. */
export function stripComposedGroups(event: CompositionEvent<HTMLInputElement>, locale: Intl.LocalesArgument): void {
  const input = event.currentTarget;
  const next = stripGroupSeparators(input.value, locale);
  if (next === input.value) {
    return;
  }
  input.setRangeText(next, 0, input.value.length, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The input's paste handler: a paste holding group separators is inserted without them, as typed text. Base UI parses the rest. */
export function stripPastedGroups(event: ClipboardEvent<HTMLInputElement>, locale: Intl.LocalesArgument): void {
  const input = event.currentTarget;
  // Base UI's own guard owns a field that takes no input.
  if (input.readOnly || input.disabled) {
    return;
  }
  const pasted = event.clipboardData.getData("text/plain");
  const stripped = stripGroupSeparators(pasted, locale);
  if (stripped === pasted) {
    return;
  }
  event.preventDefault();
  input.setRangeText(stripped, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
