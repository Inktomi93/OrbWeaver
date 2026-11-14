// Present only inside a frame-document render (`useFrameDocument`, `frame-document.ts`). `FrameMarkdown` refuses
// to render without it, so markdown that keeps raw HTML unsanitized can never reach the main document.

import { createContext } from "react";

export const FrameDocumentContext = createContext(false);
FrameDocumentContext.displayName = "FrameDocumentContext";
