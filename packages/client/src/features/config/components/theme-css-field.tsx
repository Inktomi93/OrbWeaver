// The custom-CSS code editor: live validator diagnostics, stale-hook warnings and autocomplete, all read off the
// owner-css surface. Loaded lazily by the theme editor so CodeMirror and the surface stay out of the entry chunk.
import { validateThemeCss } from "@orb/kit/css-validate";
import type { CodeEditorDiagnostic } from "@orb/ui/code-editor";
import { CodeEditor } from "@orb/ui/code-editor";
import type { ReactElement } from "react";
import { OWNER_CSS_RENAMES } from "#owner-css";
import { OWNER_CSS_COMPLETIONS } from "#src/owner-css/completions.ts";
import { themeCssHookWarnings } from "#src/owner-css/warnings.ts";
import { OWNER_CSS_SURFACE } from "../../../../owner-css-surface.ts";

export function ThemeCssField({ value, onChange }: { readonly value: string; readonly onChange: (next: string) => void }): ReactElement {
  const { errors, warnings } = validateThemeCss(value);
  const diagnostics: CodeEditorDiagnostic[] = [
    ...errors.map((message) => ({ severity: "error" as const, message, from: 0, to: 0 })),
    ...warnings.map((message) => ({ severity: "warning" as const, message, from: 0, to: 0 })),
    ...themeCssHookWarnings(value, OWNER_CSS_SURFACE, OWNER_CSS_RENAMES),
  ];
  return <CodeEditor lang="css" ariaLabel="Custom theme CSS" value={value} onChange={onChange} diagnostics={diagnostics} completions={OWNER_CSS_COMPLETIONS} />;
}
