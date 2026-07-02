import { css } from "@codemirror/lang-css";
import { basicSetup, EditorView } from "codemirror";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { cn } from "#lib";
import { cssVar } from "#tokens";

// THE token theme — the ONE CodeMirror↔design-token mapping site (D44 §12.1; ui-package-design
// §6.1 "token-themed via an editor theme built FROM the TS token map"). Every color/typography
// value is a `var(--…)` reference, so ThemeScope/theme swaps restyle the editor for free.
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
  },
  { dark: true },
);

export interface CodeEditorProps {
  /** Language mode. Only `"css"` is wired today (the custom-CSS field / Tier-B card CSS — D46). */
  readonly lang?: "css";
  /** Controlled document text — external changes are dispatched into the view. */
  readonly value: string;
  /** Fires with the full document text on every user edit. */
  readonly onChange?: (value: string) => void;
  readonly readOnly?: boolean;
  readonly ariaLabel: string;
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
 * Usage:
 * ```tsx
 * <CodeEditor lang="css" value={cardCss} onChange={setCardCss} ariaLabel="Card CSS" />
 * ```
 */
export function CodeEditor({
  lang,
  value,
  onChange,
  readOnly = false,
  ariaLabel,
  className,
}: CodeEditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // (Re)create the view when the non-controlled config changes. basicSetup/editable/attributes
  // are baked into the initial state — a fresh view is simpler than a Compartment reconfigure
  // and these props change rarely (KISS; Compartment would need an undeclared @codemirror/state
  // import anyway).
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
        EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
        ...(lang === "css" ? [css()] : []),
      ],
    });
    viewRef.current = view;
    return (): void => {
      viewRef.current = null;
      view.destroy();
    };
  }, [lang, readOnly, ariaLabel]);

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

  return (
    <div
      ref={hostRef}
      className={cn(
        "overflow-hidden rounded-control border border-border font-mono text-code",
        className,
      )}
    />
  );
}
