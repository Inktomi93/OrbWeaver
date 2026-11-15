// Render a tree to static markup for a FRAME DOCUMENT, off the render path. Its output keeps raw HTML unsanitized
// (`frame-markdown.tsx`), so it is a card-frame document's body and nothing else. `react-dom/server` loads on first
// use, so a transcript that frames nothing never pays for it.
//
// A FAILED RENDER KEEPS THE PLAIN PATH. A tree that throws while rendering statically, a `finish` that throws, and a
// renderer that fails to load all have no fallback inside a frame, so every fault answers `failed` and the caller
// renders its plain path. The fault is reported (`reportError`), so a defect still reaches the error ring.

import type { ReactElement } from "react";
import { createElement, useEffect, useEffectEvent, useState } from "react";
import { FrameDocumentContext } from "./frame-document-context.ts";

/** Where one frame document stands: rendering, rendered and finished, or failed (the caller keeps its plain path). */
export type FrameDocument<T> = { readonly state: "pending" } | { readonly state: "failed" } | { readonly state: "ready"; readonly value: T };

const PENDING = { state: "pending" } as const;
const FAILED = { state: "failed" } as const;

/**
 * Static markup of `build()` inside the frame-document context, handed to `finish` in the same pass (an effect, so
 * `finish` may read refs). `key` serializes everything `build` and `finish` read: it is the render's one trigger, so
 * a fresh closure per render never renders the markup again.
 */
export function useFrameDocument<T>(key: string, build: () => ReactElement, finish: (markup: string) => T): FrameDocument<T> {
  const [rendered, setRendered] = useState<{ readonly key: string; readonly document: FrameDocument<T> } | undefined>(undefined);
  const render = useEffectEvent(async (): Promise<FrameDocument<T>> => {
    try {
      const { renderToStaticMarkup } = await import("react-dom/server");
      return { state: "ready", value: finish(renderToStaticMarkup(createElement(FrameDocumentContext, { value: true }, build()))) };
    } catch (error) {
      reportError(error);
      return FAILED;
    }
  });
  useEffect(() => {
    let live = true;
    render()
      .then((document) => {
        if (live) {
          setRendered({ key, document });
        }
      })
      .catch(reportError);
    return (): void => {
      live = false;
    };
  }, [key]);
  return rendered?.key === key ? rendered.document : PENDING;
}
