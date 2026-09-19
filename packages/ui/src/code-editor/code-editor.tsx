import { autocompletion, completeFromList } from "@codemirror/autocomplete";
import { css } from "@codemirror/lang-css";
import type { Diagnostic } from "@codemirror/lint";
import { linter, lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { basicSetup, EditorView, minimalSetup } from "codemirror";
import type { ReactElement } from "react";
import { useEffect, useId, useRef } from "react";
import { cn, FOCUS_RING_HAS } from "#lib";
import { cssVar } from "#tokens";

// The one CodeMirror↔design-token mapping site. Every color/typography value is a var(--…)
// reference, so ThemeScope swaps restyle the editor for free. The lint module's default theme
// bakes hex colors into inline SVG data URIs, which can't reference CSS custom properties, so
// those are replaced wholesale: a token-colored text-decoration (wavy vs dotted = severity) for
// inline ranges, and a token-colored shape (circle vs triangle) for the gutter marker.
const TOKEN_THEME = EditorView.theme(
  {
    "&": {
      backgroundColor: cssVar("color.background"),
      color: cssVar("color.foreground"),
      fontFamily: cssVar("font.mono"),
      fontSize: cssVar("text.code-field"),
    },
    // The editable surface wears an INPUT's inset, not CodeMirror's default 4px/0. Without it the text
    // starts hard against the frame's left hairline while every sibling `<Input>` on the same form insets
    // its value — the tell that read as "this box is not a field" (side-eye 2026-08-03 P2).
    ".cm-content": {
      caretColor: cssVar("color.primary"),
      padding: `${cssVar("spacing.field")} ${cssVar("spacing.row")}`,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: cssVar("color.primary"),
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: cssVar("color.accent"),
    },
    ".cm-activeLine": {
      backgroundColor: cssVar("color.muted"),
    },
    ".cm-gutters": {
      backgroundColor: cssVar("color.card"),
      color: cssVar("color.muted-foreground"),
      borderRight: `1px solid ${cssVar("color.border")}`,
    },
    ".cm-activeLineGutter": {
      backgroundColor: cssVar("color.muted"),
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-lintRange": {
      backgroundImage: "none",
      textDecorationLine: "underline",
      textUnderlineOffset: "2px",
    },
    ".cm-lintRange-error": {
      textDecorationStyle: "wavy",
      textDecorationColor: cssVar("color.destructive"),
      textDecorationThickness: "2px",
    },
    ".cm-lintRange-warning": {
      textDecorationStyle: "dotted",
      textDecorationColor: cssVar("color.warning"),
      textDecorationThickness: "2px",
    },
    ".cm-diagnostic": {
      backgroundColor: cssVar("color.popover"),
      color: cssVar("color.popover-foreground"),
    },
    ".cm-diagnostic-error": { borderLeftColor: cssVar("color.destructive") },
    ".cm-diagnostic-warning": { borderLeftColor: cssVar("color.warning") },
    ".cm-tooltip-lint": {
      backgroundColor: cssVar("color.popover"),
      border: `1px solid ${cssVar("color.border")}`,
    },
    ".cm-gutter-lint": {
      backgroundColor: cssVar("color.card"),
    },
    ".cm-lint-marker": {
      content: '""',
      display: "inline-block",
    },
    ".cm-lint-marker-error": {
      content: '""',
      backgroundColor: cssVar("color.destructive"),
      borderRadius: "9999px",
      width: "0.7em",
      height: "0.7em",
    },
    ".cm-lint-marker-warning": {
      content: '""',
      backgroundColor: cssVar("color.warning"),
      clipPath: "polygon(50% 5%, 5% 95%, 95% 95%)",
      width: "0.8em",
      height: "0.75em",
    },
  },
  { dark: true },
);

/** A single lint diagnostic. */
export interface CodeEditorDiagnostic {
  readonly severity: "error" | "warning";
  readonly message: string;
  /** Document offset the flagged span starts at. */
  readonly from: number;
  /** Document offset the flagged span ends at (may equal `from`). */
  readonly to: number;
}

const DIAGNOSTIC_SEVERITY_LABEL: Record<CodeEditorDiagnostic["severity"], string> = {
  error: "Error",
  warning: "Warning",
};

// Positions come from a caller-owned parse that can lag one keystroke behind the live document —
// clamp rather than let RangeSetBuilder choke on an out-of-bounds span.
function toLintDiagnostics(diagnostics: readonly CodeEditorDiagnostic[], docLength: number): Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    const from = Math.max(0, Math.min(diagnostic.from, docLength));
    const to = Math.max(from, Math.min(diagnostic.to, docLength));
    return { from, to, severity: diagnostic.severity, message: diagnostic.message };
  });
}

export interface CodeEditorProps {
  /** Language mode. Only `"css"` is wired today. */
  readonly lang?: "css";
  /** Controlled document text — external changes are dispatched into the view. */
  readonly value: string;
  /** Fires with the full document text on every user edit. */
  readonly onChange?: (value: string) => void;
  readonly readOnly?: boolean;
  readonly ariaLabel: string;
  /**
   * How much editor chrome the surface earns.
   *
   * `"full"` (default) is `basicSetup` — line numbers, a fold gutter, an active-line highlight: right for a
   * multi-line CSS document. `"line"` is `minimalSetup`, for a one-line expression field (a regex pattern):
   * the same 31px line-number gutter that helps a stylesheet is pure furniture beside a single `/ooc:.*​/gi`,
   * and it was one of the tells that made the most important input on the regex editor read as a strip
   * rather than a field (side-eye 2026-08-03 P2).
   */
  readonly setup?: "full" | "line";
  /**
   * An id stamped on the EDITABLE surface (`.cm-content`), so a foreign `<label for>` can name a real
   * element instead of a generated one that never mounts — see `Field`'s `labelFor`.
   */
  readonly contentId?: string;
  /**
   * Lint diagnostics: an inline mark under the flagged span + a gutter marker per line, exposed to
   * assistive tech via an aria-describedby-linked live region. A fresh array re-dispatches into the
   * live view without remounting, so cursor/selection survives. Omit to skip the lint machinery.
   */
  readonly diagnostics?: readonly CodeEditorDiagnostic[];
  /**
   * A fixed completion vocabulary wired into inline autocomplete via `completeFromList`. While set
   * it replaces `basicSetup`'s default completions with just this vocabulary. Omit for the plain
   * editor (basicSetup's defaults still apply).
   */
  readonly completions?: readonly string[];
  readonly className?: string;
}

/**
 * The CodeMirror 6 seal: a controlled editor over `EditorView` + `basicSetup`, themed exclusively
 * through the design-token map. `value` is compared against the live view state before
 * dispatching (no update loops); user edits surface via `onChange`. The view is destroyed on unmount.
 */
export function CodeEditor({
  lang,
  value,
  onChange,
  readOnly = false,
  ariaLabel,
  setup = "full",
  contentId,
  diagnostics,
  completions,
  className,
}: CodeEditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const describedById = useId();
  const hasDiagnostics = diagnostics !== undefined;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // (Re)creates the view when non-controlled config changes — a fresh view is simpler than a
  // Compartment reconfigure, and these props change rarely. Diagnostic content is dispatched into
  // the live view below without ever hitting this effect.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const view = new EditorView({
      doc: valueRef.current,
      parent: host,
      extensions: [
        setup === "full" ? basicSetup : minimalSetup,
        TOKEN_THEME,
        EditorView.editable.of(!readOnly),
        // EditorView.editable only toggles contenteditable; it doesn't gate paste/drop/command
        // inserts, which check state.readOnly instead — both are needed for a real read-only contract.
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          ...(contentId === undefined ? {} : { id: contentId }),
          ...(hasDiagnostics ? { "aria-describedby": describedById } : {}),
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
        ...(lang === "css" ? [css()] : []),
        // linter(null): no auto-computed source — diagnostics are pushed via setDiagnostics below.
        ...(hasDiagnostics ? [linter(null), lintGutter()] : []),
        // `completions` is expected to be a stable reference — a genuine change rebuilds the view.
        ...(completions === undefined ? [] : [autocompletion({ override: [completeFromList([...completions])] })]),
      ],
    });
    viewRef.current = view;
    return (): void => {
      viewRef.current = null;
      view.destroy();
    };
  }, [lang, readOnly, ariaLabel, setup, contentId, hasDiagnostics, describedById, completions]);

  // Controlled value ↔ view state: dispatch only when the prop actually differs from the live
  // document, so the onChange→setState→value round-trip does not loop.
  useEffect(() => {
    valueRef.current = value;
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // A plain setDiagnostics transaction on every prop change — never remounts the editor, so
  // cursor/selection is untouched even for a freshly-derived array from a parent re-render.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || diagnostics === undefined) {
      return;
    }
    view.dispatch(setDiagnostics(view.state, toLintDiagnostics(diagnostics, view.state.doc.length)));
  }, [diagnostics]);

  return (
    <>
      {/* THE WRAPPER WEARS THE FOCUS RING (side-eye X-4, WCAG 2.4.7). CodeMirror's editable surface is a
          real keyboard stop and DOES match `:focus-visible` — but the token theme sets `&.cm-focused {
          outline: none }` (correctly: a browser outline inside a bordered frame is not this house's ring),
          and nothing put the house ring back. Measured under a real `press_key` Tab traversal: every
          ancestor up to this div computed `outline-style: none` + `box-shadow: none`, and the frame kept
          its rest-state hairline — so on the ONE field in the regex editor that swallows most keys, a
          keyboard user had no signal they had arrived, while the plain TextField one row up wore a bright
          amber ring. `FOCUS_RING_HAS` (not `focus-within:`) is the exact TextField treatment: it paints
          only when a descendant matches `:focus-visible`, which is what a text input's own
          `focus-visible:` ring does. `overflow-hidden` clips descendants, never this box's own ring. */}
      <div
        ref={hostRef}
        className={cn("overflow-hidden rounded-control border border-border font-mono text-code-field leading-code-field", FOCUS_RING_HAS, className)}
      />
      {hasDiagnostics ? (
        <div id={describedById} aria-live="polite" className="sr-only">
          {diagnostics.map((diagnostic, index) => {
            const text = `${DIAGNOSTIC_SEVERITY_LABEL[diagnostic.severity]}: ${diagnostic.message}`;
            // biome-ignore lint/suspicious/noArrayIndexKey: flat per-render diagnostics snapshot for an SR-only announcement — nothing reorders mid-list, position is stable enough.
            return <p key={index}>{text}</p>;
          })}
        </div>
      ) : null}
    </>
  );
}
