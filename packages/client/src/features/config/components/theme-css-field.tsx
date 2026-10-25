// The custom-CSS code editor: live validator diagnostics plus autocomplete from the owner-CSS surface.
import { validateThemeCss } from "@orb/kit/css-validate";
import type { CodeEditorDiagnostic, CodeEditorProps } from "@orb/ui/code-editor";
import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import { OWNER_CSS_COMPLETIONS } from "#owner-css";

// Lazy so CodeMirror never lands in the entry chunk for a modal-only editor.
const CodeEditor = lazy(async () => {
  const mod = await import("@orb/ui/code-editor");
  return { default: mod.CodeEditor };
}) as (props: CodeEditorProps) => ReactElement;

export function ThemeCssField({ value, onChange }: { readonly value: string; readonly onChange: (next: string) => void }): ReactElement {
  const { errors, warnings } = validateThemeCss(value);
  const diagnostics: CodeEditorDiagnostic[] = [
    ...errors.map((message) => ({ severity: "error" as const, message, from: 0, to: 0 })),
    ...warnings.map((message) => ({ severity: "warning" as const, message, from: 0, to: 0 })),
  ];
  return (
    <Suspense fallback={null}>
      <CodeEditor lang="css" ariaLabel="Custom theme CSS" value={value} onChange={onChange} diagnostics={diagnostics} completions={OWNER_CSS_COMPLETIONS} />
    </Suspense>
  );
}
