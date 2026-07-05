import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { kbdVariants } from "./variants";

export interface KbdProps extends ComponentProps<"kbd">, VariantProps<typeof kbdVariants> {}

/**
 * Kbd — a keyboard-shortcut chip on the `<kbd>` intrinsic (D62 §4.3 / ux-flow-revamp §4). The one
 * home for a shortcut hint: the topbar ⌘K chip, the command-palette footer, tooltip shortcut hints.
 * Mono + micro-caps on the accent surface; inert (no interactive state). Compose one key per chip —
 * `<Kbd>⌘</Kbd><Kbd>K</Kbd>` — or a whole combo as one — `<Kbd>⌘K</Kbd>`; the copy is the caller's.
 *
 * Usage: `<Kbd>⌘K</Kbd>` · `<span className="flex gap-field"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>`
 */
export function Kbd({ className, ...props }: KbdProps): ReactElement {
  return <kbd data-slot="kbd" {...props} className={cn(kbdVariants(), className)} />;
}
