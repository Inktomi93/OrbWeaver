import MiniSearch from "minisearch";
import type { ChangeEvent, KeyboardEvent, ReactElement, ReactNode } from "react";
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "#lib";
import { Textarea } from "#primitives/textarea";
import type { MacroTrigger } from "./macro-textarea-logic";
import { computeMacroInsertion, detectTrigger } from "./macro-textarea-logic";
import { macroTextareaVariants } from "./variants";

const slots = macroTextareaVariants();

const MAX_SUGGESTIONS = 8;
// Slack window for the non-mouse blur-close guard (see the Textarea `onBlur` below) — not
// load-bearing for mouse clicks, which the mousedown preventDefault already fully handles.
const BLUR_CLOSE_DELAY_MS = 100;

/**
 * A macro-catalog entry — app-level data, passed in as a prop (ui never imports a domain macro
 * registry). `name` is the literal text inserted inside `{{…}}`; a `:` in `name` marks it as a
 * parameterized macro (e.g. `getvar::name`) whose template form is `{{getvar::}}` with the caret
 * left just inside the closing braces. `args` is display-only — the arg names/hints shown in the
 * post-insert `::`-arg hint (orbweaver's automation macros take args; ui never validates them).
 */
export interface MacroSuggestion {
  name: string;
  category?: string;
  description?: string;
  args?: string[];
}

export interface MacroTextareaProps {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  /**
   * The macro catalog to complete against. Filtered against the typed partial with `minisearch`
   * (fuzzy, prefix) once more than 0 chars are typed after `{{`; the first `MAX_SUGGESTIONS`
   * entries show unfiltered on a bare `{{`. May be a fresh array reference each render — the
   * fuzzy index is memoized by the array's IDENTITY (see `getMacroSearch` below), not deep-equal,
   * so a stable app-level registry constant is what makes the memo actually pay off.
   */
  suggestions: readonly MacroSuggestion[];
  placeholder?: string;
  rows?: number;
  className?: string;
  id?: string;
  /** Forwarded as `disabled` on the underlying textarea. */
  disabled?: boolean;
  /** Optional inline helper line under the textarea. */
  helper?: ReactNode;
  /** Accessible name for the textarea when it isn't wrapped in a `<Field label>`. */
  "aria-label"?: string;
}

// Keyed by the `suggestions` ARRAY IDENTITY rather than a true module singleton (neo's catalog was
// an immutable module const; ours is a prop, so a per-array WeakMap is the closest equivalent —
// every macro-bearing field sharing the SAME app-level registry reference shares one fuzzy index
// instead of re-tokenizing the catalog per mount, and an unmounted feature's array is GC-able).
const indexCache = new WeakMap<
  readonly MacroSuggestion[],
  MiniSearch<MacroSuggestion & { id: string }>
>();

function getMacroSearch(
  suggestions: readonly MacroSuggestion[],
): MiniSearch<MacroSuggestion & { id: string }> {
  const cached = indexCache.get(suggestions);
  if (cached) {
    return cached;
  }
  const index = new MiniSearch<MacroSuggestion & { id: string }>({
    fields: ["name", "description"],
    storeFields: ["name", "description", "category", "args"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { name: 4 },
    },
  });
  index.addAll(suggestions.map((s) => ({ ...s, id: s.name })));
  indexCache.set(suggestions, index);
  return index;
}

type SuggestionRow =
  | { kind: "header"; label: string }
  | { kind: "item"; suggestion: MacroSuggestion; index: number };

/** Groups ADJACENT same-category entries with a header, preserving the relevance order the fuzzy
 * search (or the catalog itself, on a bare `{{`) already produced — a full bucket-by-category sort
 * would discard that ranking, which matters more than a strictly alphabetized grouping. */
function toRows(list: readonly MacroSuggestion[]): SuggestionRow[] {
  const rows: SuggestionRow[] = [];
  let lastCategory: string | undefined;
  list.forEach((suggestion, index) => {
    if (suggestion.category !== undefined && suggestion.category !== lastCategory) {
      rows.push({ kind: "header", label: suggestion.category });
    }
    lastCategory = suggestion.category;
    rows.push({ kind: "item", suggestion, index });
  });
  return rows;
}

/**
 * A textarea that watches for `{{…` at the caret and pops a fuzzy-matching macro autocomplete
 * anchored beneath it. Selecting a macro inserts the full `{{name}}` form (replacing whatever the
 * user typed since the `{{`); parameterized macros (`name` containing `:`) insert the `{{base::}}`
 * template with the caret left just inside the closing braces, and — since orbweaver's automation
 * macros take args where neo's didn't — surface an inline `::`-arg hint naming them.
 *
 * A hand-rolled combobox on the SAME textarea, not Base UI Autocomplete/cmdk (ui-package-design
 * §12): Autocomplete is whole-input-only (can't anchor mid-text), and cmdk would force either a
 * focus jump to its own input or a two-input state sync. ArrowUp/Down + Enter/Tab operate the
 * popover; Esc closes it leaving value + focus untouched; an empty suggestion set closes it
 * (no "no results" noise). Controlled (`value`/`onChange`) to fit TanStack Form's Field idiom.
 *
 * ARIA: the textarea plays `combobox` (`aria-expanded`/`aria-controls`/`aria-activedescendant`,
 * `aria-autocomplete="list"`) over a `listbox` popup of `option` rows — the standard combobox-with-
 * listbox-popup composite pattern, hand-wired because this widget is hand-rolled.
 *
 * Usage: `<MacroTextarea value={body} onChange={setBody} suggestions={MACRO_CATALOG} />`
 */
export function MacroTextarea({
  value,
  onChange,
  onBlur,
  suggestions,
  placeholder,
  rows = 6,
  className,
  id,
  disabled,
  helper,
  "aria-label": ariaLabel,
}: MacroTextareaProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [trigger, setTrigger] = useState<MacroTrigger | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [argHint, setArgHint] = useState<MacroSuggestion | null>(null);
  const listboxId = useId();

  const suggestionsList = useMemo<MacroSuggestion[]>(() => {
    if (trigger === null) {
      return [];
    }
    const q = trigger.partial.trim();
    if (q.length === 0) {
      return suggestions.slice(0, MAX_SUGGESTIONS);
    }
    const hits = getMacroSearch(suggestions).search(q, { combineWith: "AND" });
    // Project the stored fields explicitly rather than a blanket cast — MiniSearch hits also carry
    // score/terms/match, and the projection stays correct if the stored-fields list ever changes.
    return hits.slice(0, MAX_SUGGESTIONS).map(
      (h): MacroSuggestion => ({
        name: h["name"] as string,
        ...(h["description"] !== undefined ? { description: h["description"] as string } : {}),
        ...(h["category"] !== undefined ? { category: h["category"] as string } : {}),
        ...(h["args"] !== undefined ? { args: h["args"] as string[] } : {}),
      }),
    );
  }, [trigger, suggestions]);

  const rowsList = toRows(suggestionsList);
  const open = trigger !== null && suggestionsList.length > 0;
  const optionId = (index: number): string => `${listboxId}-option-${index}`;

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    const next = e.target.value;
    onChange(next);
    if (argHint !== null) {
      setArgHint(null);
    }
    const t = detectTrigger(next, e.target.selectionStart);
    setTrigger(t);
    if (t !== null) {
      setHighlight(0);
    }
  };

  const insertMacro = (macro: MacroSuggestion): void => {
    if (trigger === null) {
      return;
    }
    const ta = textareaRef.current;
    if (!ta) {
      return;
    }
    const { next, caret } = computeMacroInsertion(value, trigger, macro.name);
    onChange(next);
    setTrigger(null);
    setArgHint(macro.args !== undefined && macro.args.length > 0 ? macro : null);
    // Restore caret. We need the new caret *after* React applies the value, so do it on the next
    // microtask. For parameterized macros the helper sits the caret just inside the braces (after
    // `::`); otherwise after the macro.
    queueMicrotask((): void => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!open) {
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % suggestionsList.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i - 1 + suggestionsList.length) % suggestionsList.length);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      const pick = suggestionsList[highlight];
      if (pick) {
        e.preventDefault();
        insertMacro(pick);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setTrigger(null);
    }
  };

  const argHintText =
    argHint === null
      ? null
      : `Args for {{${argHint.name.split(":")[0]}}}: ${(argHint.args ?? []).join(", ")}`;

  return (
    <div className={cn(slots.root(), className)} data-slot="macro-textarea">
      <Textarea
        aria-activedescendant={open ? optionId(highlight) : undefined}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        data-slot="macro-textarea-control"
        disabled={disabled}
        id={id}
        onBlur={(): void => {
          // Two-part close-on-blur guard:
          //   • PRIMARY (mouse): the popover items' `onMouseDown` preventDefault (below) stops the
          //     textarea from ever losing focus on a click, so a macro pick never races this blur
          //     at all — that path needs no timeout.
          //   • This deferred close only covers NON-mouse blur (tab-away, focus jump, programmatic
          //     blur): close the popover, but on a short delay so any in-flight selection settles
          //     first (see BLUR_CLOSE_DELAY_MS above).
          setTimeout(() => setTrigger(null), BLUR_CLOSE_DELAY_MS);
          onBlur?.();
        }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={textareaRef}
        role="combobox"
        rows={rows}
        value={value}
        className={slots.textarea()}
      />
      {open ? (
        <div
          aria-label="Macro suggestions"
          className={slots.listbox()}
          data-slot="macro-textarea-listbox"
          id={listboxId}
          role="listbox"
        >
          {rowsList.map((row) =>
            row.kind === "header" ? (
              <div className={slots.groupLabel()} key={`header-${row.label}`} role="presentation">
                {row.label}
              </div>
            ) : (
              <button
                aria-selected={row.index === highlight}
                className={slots.item()}
                data-highlighted={row.index === highlight ? "" : undefined}
                data-slot="macro-textarea-option"
                id={optionId(row.index)}
                key={row.suggestion.name}
                onMouseDown={(e): void => {
                  // PRIMARY mouse-click guard: preventDefault on mousedown stops the textarea from
                  // blurring at all, so the popover can't unmount out from under the click — this
                  // is what actually makes mouse picks reliable (the onBlur timeout above is only
                  // the fallback for non-mouse blur paths). Fires before onClick, so the pick
                  // lands cleanly.
                  e.preventDefault();
                  insertMacro(row.suggestion);
                }}
                onMouseEnter={(): void => setHighlight(row.index)}
                role="option"
                type="button"
              >
                <span className={slots.itemMain()}>
                  <span className={slots.itemName()}>{`{{${row.suggestion.name}}}`}</span>
                  {row.suggestion.description ? (
                    <span className={slots.itemDescription()}>{row.suggestion.description}</span>
                  ) : null}
                </span>
              </button>
            ),
          )}
        </div>
      ) : null}
      {argHintText ? (
        <p className={slots.argHint()} data-slot="macro-textarea-arg-hint">
          {argHintText}
        </p>
      ) : null}
      {helper === undefined ? null : (
        <p className={slots.helper()} data-slot="macro-textarea-helper">
          {helper}
        </p>
      )}
    </div>
  );
}
