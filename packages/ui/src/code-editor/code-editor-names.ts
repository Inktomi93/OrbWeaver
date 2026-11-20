// The code editor's announced words. A zero-import leaf, so a spec's node side reads them without loading CodeMirror.

const CODE_EDITOR_SEVERITIES = ["error", "warning"] as const;

/** How serious one lint diagnostic is. */
export type CodeEditorSeverity = (typeof CODE_EDITOR_SEVERITIES)[number];

/** The word each severity is announced with. */
export const DIAGNOSTIC_SEVERITY_LABEL: Record<CodeEditorSeverity, string> = {
  error: "Error",
  warning: "Warning",
};

/** One diagnostic as the editor's live region announces it: its severity word, then its message. */
export function diagnosticAnnouncement(severity: CodeEditorSeverity, message: string): string {
  return `${DIAGNOSTIC_SEVERITY_LABEL[severity]}: ${message}`;
}
