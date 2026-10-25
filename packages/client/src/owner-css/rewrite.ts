import type { OwnerCssRename } from "./hook.ts";
import { scanHooks } from "./scan.ts";

/**
 * Replaces every recorded old hook name with its successor, so a theme written against a past name keeps working.
 * The stored CSS is untouched: this runs on the way into the document. A retired hook (`to: null`) is left as written.
 */
export function rewriteRenamedHooks(css: string, renames: readonly OwnerCssRename[]): string {
  let out = css;
  for (const ref of scanHooks(css).toReversed()) {
    const successor = renames.find((rename) => rename.kind === ref.kind && rename.name === ref.name)?.to;
    if (successor !== undefined && successor !== null) {
      out = out.slice(0, ref.from) + successor + out.slice(ref.to);
    }
  }
  return out;
}
