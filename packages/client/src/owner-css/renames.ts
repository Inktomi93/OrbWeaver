// The rename table of the owner-CSS theme contract. A hook that leaves `owner-css-surface.ts` needs a row here
// or `surface:build` refuses to regenerate. The injection path rewrites each `name` to `to` before a theme's CSS
// reaches the document, so a theme written against the old name keeps working. Keep `to` on a current name:
// chains are not followed.
import type { OwnerCssRename } from "./hook.ts";

export const OWNER_CSS_RENAMES: readonly OwnerCssRename[] = [
  // The reader's appearance settings moved onto the generated appearance channel, which is not an owner-CSS hook.
  { kind: "token", name: "--reading-line-height", to: null },
  { kind: "token", name: "--blur-strength", to: null },
  { kind: "token", name: "--reading-letter-spacing", to: null },
  { kind: "token", name: "--reading-paragraph-spacing", to: null },
];
