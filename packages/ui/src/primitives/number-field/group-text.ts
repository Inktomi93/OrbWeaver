import type { ChangeEvent, ClipboardEvent, CompositionEvent } from "react";

// Base UI reads a locale's group separator from the field's own format, and an ungrouped format renders none, so a typed
// or pasted "8,443" parses as 8. The seal removes the separator the locale groups with before Base UI sees the text.
// A separator that is never a decimal point goes everywhere, so a key-by-key entry never changes meaning mid-way. A "."
// group is also a decimal point elsewhere, so it goes only where three digits follow it to the end or the decimal.

const SAMPLE = 11_111_111.1;
const known = new Map<string, { readonly group: string; readonly decimal: string }>();

function separatorsOf(locale: Intl.LocalesArgument): { readonly group: string; readonly decimal: string } {
  const key = JSON.stringify(locale ?? null);
  const cached = known.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(SAMPLE);
  const found = {
    group: parts.find((part) => part.type === "group")?.value ?? "",
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
  };
  known.set(key, found);
  return found;
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** `text` with the locale's group separators removed. */
function stripGroupSeparators(text: string, locale: Intl.LocalesArgument): string {
  const { group, decimal } = separatorsOf(locale);
  if (group === "") {
    return text;
  }
  if (group === ".") {
    const grouped = new RegExp(`^([+\\-−]?\\d+(?:\\.\\d{3})+)(?=$|${escaped(decimal)})`, "u").exec(text);
    const lead = grouped?.[1];
    return lead === undefined ? text : lead.replaceAll(".", "") + text.slice(lead.length);
  }
  if (/\p{Zs}/u.test(group)) {
    return text.replace(/\p{Zs}/gu, "");
  }
  return group === "'" || group === "’" ? text.replace(/['’]/gu, "") : text.split(group).join("");
}

/** How many characters `next` lost from `raw` before `caret`; `next` is `raw` with characters deleted. */
function removedBefore(raw: string, next: string, caret: number): number {
  let removed = 0;
  for (let at = 0, kept = 0; at < caret; at += 1) {
    if (raw[at] === next[kept]) {
      kept += 1;
    } else {
      removed += 1;
    }
  }
  return removed;
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
  const caret = (input.selectionStart ?? raw.length) - removedBefore(raw, next, input.selectionStart ?? raw.length);
  input.value = next;
  input.setSelectionRange(caret, caret);
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

/** The input's paste handler: a paste is trimmed and inserted without group separators, as typed text. Base UI parses the rest. */
export function stripPastedGroups(event: ClipboardEvent<HTMLInputElement>, locale: Intl.LocalesArgument): void {
  const input = event.currentTarget;
  // Base UI's own guard owns a field that takes no input.
  if (input.readOnly || input.disabled) {
    return;
  }
  const pasted = event.clipboardData.getData("text/plain");
  const stripped = stripGroupSeparators(pasted.trim(), locale);
  if (stripped === pasted) {
    return;
  }
  event.preventDefault();
  input.setRangeText(stripped, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
