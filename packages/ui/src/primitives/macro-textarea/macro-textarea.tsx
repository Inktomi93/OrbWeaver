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
// Slack window for the non-mouse blur-close guard — not load-bearing for mouse clicks, which the
// mousedown preventDefault already fully handles.
const BLUR_CLOSE_DELAY_MS = 100;

/**
 * A macro-catalog entry — app-level data, passed in as a prop. `name` is the literal text inserted
 * inside `{{…}}`; a `:` in `name` marks it parameterized (e.g. `getvar::name`), whose template form
 * is `{{getvar::}}` with the caret left just inside the closing braces. `args` is display-only.
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
   * The macro catalog to complete against. Filtered with `minisearch` (fuzzy, prefix) once chars
   * follow `{{`; the fuzzy index is memoized by the array's identity, so a stable registry
   * constant is what makes the memo pay off.
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

// Keyed by array identity: every field sharing the same registry reference shares one fuzzy index,
// and an unmounted feature's array is GC-able.
const indexCache = new WeakMap<readonly MacroSuggestion[], MiniSearch<MacroSuggestion & { id: string }>>();

function getMacroSearch(suggestions: readonly MacroSuggestion[]): MiniSearch<MacroSuggestion & { id: string }> {
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

type SuggestionRow = { kind: "header"; label: string } | { kind: "item"; suggestion: MacroSuggestion; index: number };

/** Groups adjacent same-category entries with a header, preserving the fuzzy search's relevance order. */
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
 * anchored beneath it. Selecting a macro inserts the full `{{name}}` form; parameterized macros
 * insert the `{{base::}}` template with the caret left inside the closing braces plus an inline
 * `::`-arg hint. Hand-rolled combobox on the same textarea (not Base UI Autocomplete/cmdk, which
 * can't anchor mid-text or would force a two-input state sync). Controlled to fit TanStack Form's
 * Field idiom.
 *
 * ARIA — A MULTILINE TEXTBOX THAT SOMETIMES OWNS A LISTBOX, never a combobox (side-eye F-3, 2026-08-03).
 * The field used to carry `role="combobox"` unconditionally, and that is three defects in one attribute:
 *   1. `combobox` OVERRIDES the native `textbox` role, and `combobox` does not support `aria-multiline` —
 *      so a 4-row prompt editor announced as a single-line pick-one control.
 *   2. The W3C accname algorithm falls through to the control's VALUE for a combobox, so the field's
 *      accessible name became the entire 60-word template it holds (announced TWICE: once as the name,
 *      once as the value). A screen-reader user heard a whole prompt template before they could type.
 *   3. `aria-expanded`/`aria-haspopup` are not supported on `textbox`, and a combobox that is collapsed
 *      99% of its life is claiming a popup relationship that does not exist.
 * The shape here is the mid-text inline-autocomplete one (the \@-mention pattern): the textarea keeps its
 * NATIVE `textbox` role (and with it the implicit `aria-multiline="true"`), its name stays the `<Field>`
 * label / `aria-label`, and the popup is exposed ONLY while it is open — `aria-controls` +
 * `aria-activedescendant` point at the live listbox, and an `aria-live` status line announces the match
 * count so a non-sighted user learns the popup appeared at all (which is the affordance `aria-expanded`
 * was pretending to carry). The textarea remains the one tab stop; the highlight moves with Arrow keys.
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
    // Explicit projection rather than a blanket cast — MiniSearch hits also carry score/terms/match.
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
    // Restore caret after React applies the value (next microtask).
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

  const argHintText = argHint === null ? null : `Args for {{${argHint.name.split(":")[0]}}}: ${(argHint.args ?? []).join(", ")}`;

  return (
    <div className={cn(slots.root(), className)} data-slot="macro-textarea">
      <Textarea
        aria-activedescendant={open ? optionId(highlight) : undefined}
        // `aria-autocomplete="list"` IS supported on `textbox` and is the honest declaration: typing can
        // surface a list of completions. It stays; `aria-expanded`/`aria-haspopup`/`role=combobox` do not.
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        data-slot="macro-textarea-control"
        disabled={disabled}
        // mergeProps treats an explicit key as an override even when undefined — a bare id={id}
        // would erase Field.Control's auto-generated id when the caller doesn't pass one.
        {...(id === undefined ? {} : { id })}
        onBlur={(): void => {
          // Mouse picks are handled by the popover's own mousedown preventDefault (below); this
          // deferred close covers non-mouse blur (tab-away, programmatic) after a short settle delay.
          setTimeout(() => setTrigger(null), BLUR_CLOSE_DELAY_MS);
          onBlur?.();
        }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={textareaRef}
        rows={rows}
        value={value}
        className={slots.textarea()}
      />
      {open ? (
        <div aria-label="Macro suggestions" className={slots.listbox()} data-slot="macro-textarea-listbox" id={listboxId} role="listbox">
          {rowsList.map((row) =>
            row.kind === "header" ? (
              <div className={slots.groupLabel()} data-slot="macro-textarea-group-header" key={`header-${row.label}`} role="presentation">
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
                // tabIndex=-1 keeps option rows out of the tab sequence (the textarea is the one
                // tab stop; highlight moves via ArrowUp/Down) without affecting pointer activation.
                tabIndex={-1}
                onMouseDown={(e): void => {
                  // preventDefault stops the textarea from blurring at all, so the popover can't
                  // unmount out from under the click.
                  e.preventDefault();
                  insertMacro(row.suggestion);
                }}
                onMouseEnter={(): void => setHighlight(row.index)}
                role="option"
                type="button"
              >
                <span className={slots.itemMain()}>
                  <span className={slots.itemName()}>{`{{${row.suggestion.name}}}`}</span>
                  {row.suggestion.description !== undefined && row.suggestion.description !== "" ? (
                    <span className={slots.itemDescription()}>{row.suggestion.description}</span>
                  ) : null}
                </span>
              </button>
            ),
          )}
        </div>
      ) : null}
      {/* The popup's APPEARANCE, announced. With `aria-expanded` gone (see the ARIA note above) nothing
          else tells a non-sighted user that typing `{{` surfaced completions — `aria-controls` alone is a
          relationship, not an event. A polite count is the whole affordance in one clause. */}
      <span aria-live="polite" className="sr-only" data-slot="macro-textarea-status">
        {open ? `${String(suggestionsList.length)} macro suggestions` : ""}
      </span>
      {argHintText !== null ? (
        // aria-live: the hint appears after the popover closes, so it needs to be announced.
        <p aria-live="polite" className={slots.argHint()} data-slot="macro-textarea-arg-hint">
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
