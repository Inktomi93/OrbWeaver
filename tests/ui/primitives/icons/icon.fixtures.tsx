// CT story for <Icon> — Playwright CT cannot serialize a component-as-prop across the mount
// boundary (`icon={X}` would arrive as a callback proxy, not a component), so the composition is
// pre-bound here and the test mounts the story (the standard CT wrapper pattern).
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement } from "react";

export interface CloseIconStoryProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

/** `<Icon icon={X}>` pre-composed for tests/ui/primitives/icons/icon.ct.tsx. */
export function CloseIconStory({ size = "md", label }: CloseIconStoryProps): ReactElement {
  // exactOptionalPropertyTypes: forward `label` only when set (an explicit `undefined` is illegal on
  // an optional prop); `size` gets a concrete default so it never forwards `undefined`.
  return <Icon icon={X} size={size} {...(label === undefined ? {} : { label })} />;
}
