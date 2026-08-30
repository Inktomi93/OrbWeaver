// One search-result / token-menu row (config-revamp-design.md §3.3) — the `CommandItem` frame with the ONE
// two-slot anatomy every hit shares: the marked label (the caller's `HighlightedText`, so a hit shows WHY it
// matched) and the muted CONTEXT beside it (the owning group's label, a token's hint). Split from the input
// so the results list, the token menu and the dynamic member rows cannot drift into three row grammars.

import { CommandItem } from "@orb/ui/command";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface CommandRowProps {
  readonly value: string;
  readonly onSelect: () => void;
  /** The muted trailing context — the group label for a hit, the hint for a token. Absent for a group row
   *  (its label IS the group). */
  readonly context?: string;
  readonly children: ReactNode;
}

export function CommandRow({ value, onSelect, context, children }: CommandRowProps): ReactElement {
  return (
    <CommandItem onSelect={onSelect} value={value}>
      {children}
      {context === undefined ? null : <Text voice="gloss">{context}</Text>}
    </CommandItem>
  );
}
