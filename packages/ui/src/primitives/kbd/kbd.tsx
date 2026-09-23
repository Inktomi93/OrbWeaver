import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantProps } from "#lib";
import { kbdVariants } from "./variants.ts";

export interface KbdProps extends ComponentProps<"kbd">, VariantProps<typeof kbdVariants> {}

/**
 * Kbd — a keyboard-shortcut chip on the `<kbd>` intrinsic. The one
 * home for a shortcut hint: the topbar ⌘K chip, the command-palette footer, tooltip shortcut hints.
 * Mono + micro-caps on the accent surface; inert (no interactive state). Compose one key per chip —
 * `<Kbd>⌘</Kbd><Kbd>K</Kbd>` — or a whole combo as one — `<Kbd>⌘K</Kbd>`; the copy is the caller's.
 *
 * `size="command"` sets a whole typed command at the code step, for a command shown inside prose.
 *
 * Usage: `<Kbd>⌘K</Kbd>` · `<span className="flex gap-field"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>`
 */
export function Kbd({ className, size, ...props }: KbdProps): ReactElement {
  // The className AND the `data-size` axis stamp, from ONE selection object (#1080).
  return <kbd data-slot="kbd" {...variantProps(kbdVariants, { size }, className)} {...props} />;
}
