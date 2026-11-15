// The markdown seal for a FRAME DOCUMENT ONLY: the transcript's own elements, plugins and root classes, with raw
// HTML kept and NOT sanitized, because the sandboxed card frame (D294, `@orb/kit/card-frame`) is the boundary
// its output is served behind. Its output must never enter the main document.
//
// Two controls keep it there: it throws outside `FrameDocumentContext`, which only `useFrameDocument`
// (`frame-document.ts`) provides, and policy `ui-frame-markdown-frame-only` admits
// one importer of its door, `packages/client/src/features/chat/components/reply-frame.tsx`.
//
// Links render as plain anchors (Streamdown's link-safety button would be a dead control inside a frame); the
// frame's pinned script hands a click to the host, which opens it only through its own confirm.

import type { ReactElement } from "react";
import { use } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";
import { MARKDOWN_MATH_PLUGIN } from "../math.ts";
import { MARKDOWN_REMARK_PLUGINS } from "../policy.ts";
import { markdownRootClass, sealComponents } from "../seal.ts";
import { MARKDOWN_SHIKI_PLUGIN } from "../shiki-plugin.ts";
import { FRAME_ELEMENT_COMPONENTS } from "./frame-components.tsx";
import { FrameDocumentContext } from "./frame-document-context.ts";

// `raw` alone: the sanitize and harden passes are what keep markup inert in the main document, and the frame
// replaces both.
const FRAME_REHYPE_PLUGINS = [defaultRehypePlugins["raw"]].filter((plugin) => plugin !== undefined);
const FRAME_PLUGINS = { code: MARKDOWN_SHIKI_PLUGIN, math: MARKDOWN_MATH_PLUGIN };
const NO_LINK_SAFETY = { enabled: false };

/** One settled markdown body rendered for a frame document. */
export function FrameMarkdown({ children, colorQuotes }: { readonly children: string; readonly colorQuotes: boolean }): ReactElement {
  if (!use(FrameDocumentContext)) {
    throw new Error("FrameMarkdown renders only inside a frame document; its raw HTML is not sanitized.");
  }
  return (
    <Streamdown
      mode="static"
      dir="auto"
      parseIncompleteMarkdown={false}
      remarkPlugins={MARKDOWN_REMARK_PLUGINS}
      rehypePlugins={FRAME_REHYPE_PLUGINS}
      plugins={FRAME_PLUGINS}
      components={{ ...sealComponents(false, colorQuotes), ...FRAME_ELEMENT_COMPONENTS }}
      linkSafety={NO_LINK_SAFETY}
      className={markdownRootClass()}
    >
      {children}
    </Streamdown>
  );
}
