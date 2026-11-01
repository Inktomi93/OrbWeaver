import type { ChangeEvent, ClipboardEvent } from "react";

// Base UI reads a locale's group separator from the field's own format, and an ungrouped format renders none, so a typed
// or pasted "8,443" parses as 8. The seal strips the separator the locale itself groups with before Base UI sees the text.

const SAMPLE = 11_111_111.1;
const separators = new Map<string, string>();

/** The group separator the locale writes for a grouped number, or "" when it has none. Derived from the formatter, never guessed. */
function groupSeparator(locale: Intl.LocalesArgument): string {
  const key = JSON.stringify(locale ?? null);
  const known = separators.get(key);
  if (known !== undefined) {
    return known;
  }
  const part = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(SAMPLE).find((candidate) => candidate.type === "group");
  const found = part?.value ?? "";
  separators.set(key, found);
  return found;
}

/** `text` with the locale's group separators removed. Space-like and apostrophe separators match their whole family, as Base UI's own parse does. */
export function stripGroupSeparators(text: string, locale: Intl.LocalesArgument): string {
  const group = groupSeparator(locale);
  if (group === "") {
    return text;
  }
  if (/\p{Zs}/u.test(group)) {
    return text.replace(/\p{Zs}/gu, "");
  }
  if (group === "'" || group === "’") {
    return text.replace(/['’]/gu, "");
  }
  return text.split(group).join("");
}

/** The input's change handler: removes group separators from the DOM text, keeping the caret, before Base UI reads it. */
export function stripTypedGroups(event: ChangeEvent<HTMLInputElement>, locale: Intl.LocalesArgument): void {
  const input = event.currentTarget;
  const raw = input.value;
  const next = stripGroupSeparators(raw, locale);
  if (next === raw) {
    return;
  }
  const caret = input.selectionStart ?? raw.length;
  const caretAfter = stripGroupSeparators(raw.slice(0, caret), locale).length;
  input.value = next;
  input.setSelectionRange(caretAfter, caretAfter);
}

/** The input's paste handler: a paste holding group separators is inserted without them, as typed text. Base UI parses the rest. */
export function stripPastedGroups(event: ClipboardEvent<HTMLInputElement>, locale: Intl.LocalesArgument): void {
  const pasted = event.clipboardData.getData("text/plain");
  const stripped = stripGroupSeparators(pasted, locale);
  if (stripped === pasted) {
    return;
  }
  event.preventDefault();
  const input = event.currentTarget;
  input.setRangeText(stripped, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
