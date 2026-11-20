import { CtIsolation } from "@orb/testkit/browser";
import { CodeEditor } from "@orb/ui/code-editor";
import { CodeEditorFallback } from "@orb/ui/code-editor/fallback";
import type { ReactElement } from "react";

const COLUMN_WIDTH = 480;

/** The code editor and its fallback over one document, in columns of one width. */
export function CodeEditorFallbackStory({ value, setup }: { readonly value: string; readonly setup: "full" | "line" }): ReactElement {
  return (
    <CtIsolation subject="The code editor and its fallback" isolates="CodeEditor beside CodeEditorFallback over one document">
      <section aria-label="Editor" style={{ inlineSize: COLUMN_WIDTH }}>
        <CodeEditor ariaLabel="Document" value={value} setup={setup} />
      </section>
      <section aria-label="Fallback" style={{ inlineSize: COLUMN_WIDTH }}>
        <CodeEditorFallback value={value} />
      </section>
    </CtIsolation>
  );
}
