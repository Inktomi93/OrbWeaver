// The vocabulary of the owner-CSS theme contract: what a public hook is and which kinds exist.
// Pure and alias-free, because the node-side generator (`owner-css-surface.build.ts`) imports it too.

/**
 * What a public hook names: a `data-slot` value, a `.shell-*` class, a custom property (served tokens, ThemeScope vars
 * and the registered `--appearance-*` properties are all tokens), or a `data-appearance-*` root attribute.
 */
const OWNER_CSS_HOOK_KINDS = ["slot", "shell-class", "token", "appearance-attribute"] as const;
export type OwnerCssHookKind = (typeof OWNER_CSS_HOOK_KINDS)[number];

/** One name the owner's custom CSS may target. */
export interface OwnerCssHook {
  readonly kind: OwnerCssHookKind;
  /** The bare name: a slot value, a class without its dot, a custom property with its `--`, or an attribute name. */
  readonly name: string;
  /** The values an attribute hook matches, for autocomplete. */
  readonly values?: readonly string[];
  /** The attribute carries a space-separated list of those values, so it may also be empty. */
  readonly members?: boolean;
}

/**
 * A hook that left the public surface. `to` is the successor the injection path rewrites it to, or `null` when no
 * rewrite is safe. `see` names the replacement for a hook whose old value has no one-to-one new form, so the
 * warning can point at it. A row with `value` records one value an attribute hook no longer matches (its `to` is
 * `null`); the attribute itself stays on the surface.
 */
export interface OwnerCssRename extends Pick<OwnerCssHook, "kind" | "name"> {
  readonly to: string | null;
  readonly see?: string;
  readonly value?: string;
}
