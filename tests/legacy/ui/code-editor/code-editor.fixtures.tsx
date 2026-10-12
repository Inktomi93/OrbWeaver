// CT fixtures for the CodeEditor seal. Playwright CT serializes mount props, so the controlled
// state loop (value ↔ onChange) lives HERE; the tests pass only strings.
import type { CodeEditorDiagnostic } from "@orb/ui/code-editor";
import { CodeEditor } from "@orb/ui/code-editor";
import type { ReactElement } from "react";
import { useState } from "react";

interface ControlledEditorProps {
  readonly initialValue: string;
}

/** Controlled editor whose live value is mirrored into an `<output>` (role=status) for asserts. */
export function ControlledEditor({ initialValue }: ControlledEditorProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  return (
    <div>
      <CodeEditor lang="css" value={value} onChange={setValue} ariaLabel="fixture css editor" />
      <output>{value}</output>
    </div>
  );
}

/** The KEYBOARD-ARRIVAL fixture (side-eye X-4): a preceding tab stop, then the editor, so a test can Tab
 *  INTO the editor for real. A scripted `.focus()` cannot prove this — Chromium only promotes a focus to
 *  `:focus-visible` when it came from the keyboard, which is precisely the state the ring keys on. */
export function TabbableEditor({ initialValue }: ControlledEditorProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  return (
    <div>
      <button type="button">before</button>
      <CodeEditor lang="css" value={value} onChange={setValue} ariaLabel="fixture tabbable editor" />
    </div>
  );
}

interface ReadOnlyEditorProps {
  readonly value: string;
}

export function ReadOnlyEditor({ value }: ReadOnlyEditorProps): ReactElement {
  return <CodeEditor lang="css" value={value} readOnly={true} ariaLabel="fixture readonly editor" />;
}

interface CompletionsEditorProps {
  readonly initialValue: string;
  readonly completions: readonly string[];
}

/** Controlled editor with a fixed `completions` vocabulary (WS3 — the theme-editor CSS var
 *  autocomplete seam). */
export function CompletionsEditor({ initialValue, completions }: CompletionsEditorProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  return <CodeEditor lang="css" value={value} onChange={setValue} ariaLabel="fixture completions editor" completions={completions} />;
}

interface DiagnosticsEditorProps {
  readonly initialValue: string;
  readonly initialDiagnostics: readonly CodeEditorDiagnostic[];
  /** A distinct (freshly-derived) diagnostics array swapped in on the "update diagnostics" click —
   * the real consumer shape (ui-primitive-contract §R7): the parent re-renders with a new array. */
  readonly nextDiagnostics: readonly CodeEditorDiagnostic[];
}

/**
 * Controlled editor with controlled diagnostics, so a test can trigger a diagnostics-only prop
 * change (the button) independently of typing (the editor content) — proving the re-render
 * never remounts the view (§ correctness contract: no cursor jump).
 */
export function DiagnosticsEditor({ initialValue, initialDiagnostics, nextDiagnostics }: DiagnosticsEditorProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  const [diagnostics, setDiagnostics] = useState<readonly CodeEditorDiagnostic[]>(initialDiagnostics);
  const handleUpdateDiagnostics = (): void => setDiagnostics(nextDiagnostics);
  return (
    <div>
      <CodeEditor lang="css" value={value} onChange={setValue} ariaLabel="fixture diagnostics editor" diagnostics={diagnostics} />
      <output>{value}</output>
      <button type="button" onClick={handleUpdateDiagnostics}>
        Update diagnostics
      </button>
    </div>
  );
}
