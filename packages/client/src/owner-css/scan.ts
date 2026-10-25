// Finds the theme-hook names a stylesheet spells, with the exact span of each name. The rewrite and the stale-hook
// warnings both read this, so they agree on what counts as a reference.
import type { OwnerCssHookKind } from "./hook.ts";

export interface HookReference {
  readonly kind: OwnerCssHookKind;
  readonly name: string;
  readonly from: number;
  readonly to: number;
  /** A custom property being declared (`--x: …`), as opposed to read through `var(--x)`. */
  readonly declaration: boolean;
}

const COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/gu;

// Group 1 of each pattern is the name. Only the exact-match attribute forms name a whole slot; `^=`, `*=` and
// `|=` match a prefix or fragment, which no surface entry can stand for.
const PATTERNS: readonly { readonly kind: OwnerCssHookKind; readonly declaration: boolean; readonly pattern: RegExp }[] = [
  { kind: "slot", declaration: false, pattern: /\[data-slot~?=["']?([\w-]+)/gu },
  { kind: "shell-class", declaration: false, pattern: /\.(shell-[\w-]+)/gu },
  { kind: "token", declaration: false, pattern: /var\(\s*(--[\w-]+)/gu },
  { kind: "token", declaration: true, pattern: /(?<![\w-])(--[\w-]+)\s*:/gu },
];

/** Every hook reference outside comments, in document order. Comments are blanked in place so offsets stay true. */
export function scanHooks(css: string): readonly HookReference[] {
  const active = css.replace(COMMENT, (comment) => comment.replace(/[^\n]/gu, " "));
  return PATTERNS.flatMap(({ kind, declaration, pattern }) =>
    [...active.matchAll(pattern)].flatMap((match) => {
      const name = match[1];
      if (name === undefined) {
        return [];
      }
      const from = match.index + match[0].indexOf(name);
      return [{ kind, name, from, to: from + name.length, declaration }];
    }),
  ).sort((a, b) => a.from - b.from);
}
