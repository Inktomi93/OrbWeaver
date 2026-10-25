// The vocabulary of the owner-CSS theme contract: what a public hook is and which kinds exist.
// Pure and alias-free, because the node-side generator (`owner-css-surface.build.ts`) imports it too.

/** What a public hook names: a `data-slot` value, a `.shell-*` class, or a served token (the ThemeScope vars are tokens). */
export type OwnerCssHookKind = "slot" | "shell-class" | "token";

/** One name the owner's custom CSS may target. */
export interface OwnerCssHook {
  readonly kind: OwnerCssHookKind;
  /** The bare name: a slot value, a class without its dot, or a custom property with its `--`. */
  readonly name: string;
}

/** A hook that left the public surface: `to` is its successor, or `null` when it was retired with none. */
export interface OwnerCssRename extends OwnerCssHook {
  readonly to: string | null;
}
