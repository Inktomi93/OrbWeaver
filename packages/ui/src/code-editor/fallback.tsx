// The code editor's frame, and the box it holds before CodeMirror loads. The editor's chunk is lazy (it carries CodeMirror), so this
// file imports nothing from it: a caller shows `CodeEditorFallback` as its Suspense fallback and the editor's arrival moves nothing.

import type { ReactElement } from "react";

/** The frame the editor wears: the one box its fallback and its host both paint. */
export const CODE_EDITOR_FRAME = "overflow-hidden rounded-control border border-border font-mono text-code-field leading-code-field";

/** The editor's frame around the document's own text, plain: the same inset and line height the editor settles into. */
export function CodeEditorFallback({ value }: { readonly value: string }): ReactElement {
  // The final newline keeps a line box for the document's last line, which is empty when the document is or ends in a newline.
  return (
    <div aria-hidden={true} className={CODE_EDITOR_FRAME}>
      <div className="px-row py-field wrap-anywhere whitespace-pre-wrap">{`${value}\n`}</div>
    </div>
  );
}
