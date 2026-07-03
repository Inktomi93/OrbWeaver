import { css } from "@codemirror/lang-css";
import type { Diagnostic } from "@codemirror/lint";
import { linter, lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import type { ReactElement } from "react";
import { useEffect, useId, useRef } from "react";
import { cn } from "#lib";
import { cssVar } from "#tokens";

// THE token theme — the ONE CodeMirror↔design-token mapping site (D44 §12.1; ui-package-design
// §6.1 "token-themed via an editor theme built FROM the TS token map"). Every color/typography
// value is a `var(--…)` reference, so ThemeScope/theme swaps restyle the editor for free.
//
// Diagnostics (A5): `@codemirror/lint`'s own default theme bakes literal hex colors into inline
// SVG data URIs (the gutter marker's `content: url(...)`, the inline mark's squiggle
// `backgroundImage: url(...)`) — a data URI is its own document, so it cannot reference this
// document's CSS custom properties. Those defaults are therefore replaced wholesale rather than
// recolored: inline ranges get a token-colored `text-decoration` whose STYLE (wavy vs dotted) is
// the non-color severity signal, and the gutter gets a token-colored SHAPE (circle vs triangle)
// via `background-color` + `clip-path`. A real `EditorView.theme` always outranks the lint
// module's `EditorView.baseTheme` (CM6's precedence contract), so no `!important` is needed.
const TOKEN_THEME = EditorView.theme(
  {
    "&": {
      backgroundColor: cssVar("color.background"),
      color: cssVar("color.foreground"),
      fontFamily: cssVar("font.mono"),
      fontSize: cssVar("text.code"),
    },
    ".cm-content": {
      caretColor: cssVar("color.primary"),
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

/** A single lint diagnostic (A5 — CEL/macro rule diagnostics, themes custom-CSS `@import` warnings). */
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

// Positions come from a caller-owned parse (CEL/macro spans, custom-CSS lint) that can lag one
// keystroke behind the live document — clamp rather than let `@codemirror/lint`'s internal
// RangeSetBuilder choke on an out-of-bounds span. Every diagnostic is kept (never dropped): a
// clamped mark still carries its message into the tooltip + the live region.
function toLintDiagnostics(
  diagnostics: readonly CodeEditorDiagnostic[],
  docLength: number,
): Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    const from = Math.max(0, Math.min(diagnostic.from, docLength));
    const to = Math.max(from, Math.min(diagnostic.to, docLength));
    return { from, to, severity: diagnostic.severity, message: diagnostic.message };
  });
}

export interface CodeEditorProps {
  /** Language mode. Only `"css"` is wired today (the custom-CSS field / Tier-B card CSS — D46). */
  readonly lang?: "css";
  /** Controlled document text — external changes are dispatched into the view. */
  readonly value: string;
  /** Fires with the full document text on every user edit. */
  readonly onChange?: (value: string) => void;
  readonly readOnly?: boolean;
  readonly ariaLabel: string;
  /**
   * Lint diagnostics (A5), rendered via `@codemirror/lint`: an inline mark under the flagged
   * span + a gutter marker per line, both token-themed (never color alone — see `TOKEN_THEME`
   * above) and exposed to assistive tech through an `aria-describedby`-linked live region.
   * Passing a fresh array (a different reference, same or different content) re-dispatches the
   * diagnostics into the LIVE view via `setDiagnostics` — it never remounts the editor, so the
   * cursor/selection survives. Omit entirely to skip the lint gutter/machinery altogether (the
   * plain read/write editor stays exactly as before this feature).
   */
  readonly diagnostics?: readonly CodeEditorDiagnostic[];
  readonly className?: string;
}

/**
 * The CodeMirror 6 seal (ui-package-design §6.1 — no raw `@codemirror/*` import outside this
 * dir; dep-cruiser `ui-satellite-seals`): a controlled editor over `EditorView` + `basicSetup`,
 * themed exclusively through the design-token map (D44 §12.1 — one mapping site, above).
 *
 * Controlled contract: `value` is compared against the live view state before dispatching (no
 * update loops); user edits surface through `onChange` via an `updateListener`. The view is
 * destroyed on unmount.
 *
 * @example
 * ```tsx
 * <CodeEditor lang="css" value={cardCss} onChange={setCardCss} ariaLabel="Card CSS" />
 * <CodeEditor lang="css" value={css} onChange={setCss} ariaLabel="Custom CSS" diagnostics={warnings} />
 * ```
 */
export function CodeEditor({
  lang,
  value,
  onChange,
  readOnly = false,
  ariaLabel,
  diagnostics,
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

  // (Re)create the view when non-controlled config changes: basicSetup/editable/readOnly/
  // attributes are baked into the initial state — a fresh view is simpler than a Compartment
  // reconfigure, and these props change rarely (KISS). `hasDiagnostics` (opts the lint gutter
  // in/out) belongs here because it changes the STATIC extension list; diagnostic CONTENT is
  // dispatched into the live view below without ever hitting this effect.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const view = new EditorView({
      doc: valueRef.current,
      parent: host,
      extensions: [
        basicSetup,
        TOKEN_THEME,
        EditorView.editable.of(!readOnly),
        // `EditorView.editable` only toggles `contenteditable` (DOM typing); it does NOT gate
        // paste/drop/command-triggered inserts — those check `state.readOnly` (verified against
        // the CodeMirror 6 docs: "Not to be confused with EditorView.editable, which controls
        // whether the editor's DOM is set to be editable"). Both facets are needed for a real
        // read-only contract.
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          ...(hasDiagnostics ? { "aria-describedby": describedById } : {}),
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
        ...(lang === "css" ? [css()] : []),
        // `linter(null)`: no auto-computed source — diagnostics are caller-controlled and pushed
        // in via `setDiagnostics` below, never derived from document-idle recomputation.
        ...(hasDiagnostics ? [linter(null), lintGutter()] : []),
      ],
    });
    viewRef.current = view;
    return (): void => {
      viewRef.current = null;
      view.destroy();
    };
  }, [lang, readOnly, ariaLabel, hasDiagnostics, describedById]);

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

  // Diagnostics ↔ view state: a plain `setDiagnostics` transaction, dispatched on every prop
  // change (including the `undefined`↔defined edge, which the effect above already remounted
  // the view for — a redundant-but-harmless dispatch against a just-created view). This is the
  // ONLY diagnostics-driven effect that does not depend on lang/readOnly/ariaLabel, which is the
  // correctness contract: re-rendering with new diagnostics (even a freshly-derived array from a
  // parent re-render) never remounts the editor, so the cursor/selection is untouched.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || diagnostics === undefined) {
      return;
    }
    view.dispatch(
      setDiagnostics(view.state, toLintDiagnostics(diagnostics, view.state.doc.length)),
    );
  }, [diagnostics]);

  return (
    <>
      <div
        ref={hostRef}
        className={cn(
          "overflow-hidden rounded-control border border-border font-mono text-code",
          className,
        )}
      />
      {hasDiagnostics ? (
        <div id={describedById} aria-live="polite" className="sr-only">
          {diagnostics.map((diagnostic, index) => {
            const text = `${DIAGNOSTIC_SEVERITY_LABEL[diagnostic.severity]}: ${diagnostic.message}`;
            // biome-ignore lint/suspicious/noArrayIndexKey: a flat per-render diagnostics snapshot for an SR-only announcement — nothing reorders mid-list, position is a stable-enough identity.
            return <p key={index}>{text}</p>;
          })}
        </div>
      ) : null}
    </>
  );
}
