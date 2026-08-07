// SectionTopbarTitle — resolves what the MOBILE topbar calls the current screen: the OPEN member's own name
// where the active section resolves one (`SectionDefinition.useSelectionTitle`), else the section label
// (side-eye P2: every section but chats named the SECTION over a member, because only chats supplied a
// topbar `header` node).
//
// A component, not a hook call in `useShellLayout`: `useSelectionTitle` is a PER-SECTION hook, so the caller
// must be KEYED on the active section — the `SectionContextHost` idiom. The value is handed back through a
// render prop because the topbar wants a string (it truncates it, and it is the row's only name), and a
// keyed component is the only place the hook may legally run.

import type { ReactElement, ReactNode } from "react";
import type { SectionDefinition } from "#state";

export interface SectionTopbarTitleProps {
  readonly definition: SectionDefinition;
  /** The section label — what shows while nothing is open, or while the name has not landed. */
  readonly fallback: string;
  readonly children: (title: string) => ReactNode;
}

export function SectionTopbarTitle({ definition, fallback, children }: SectionTopbarTitleProps): ReactElement {
  // Called UNCONDITIONALLY — every section declares one (a section with no member to name declares
  // `NO_SELECTION_TITLE`), and this component is keyed on the section id, so a section switch remounts
  // rather than swapping one hook for another under a live mount.
  const resolved = definition.useSelectionTitle();
  return <>{children(resolved ?? fallback)}</>;
}
