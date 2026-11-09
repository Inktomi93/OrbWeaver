import { createContext } from "react";

/** A host whose action may carry a label of any length (an empty state's action) provides `true`, so a text Button inside it wraps at enlarged text instead of overflowing. A `wrap`, `square` or `stacked` the caller states wins. */
export const ButtonWrapContext = createContext(false);
ButtonWrapContext.displayName = "ButtonWrapContext";
