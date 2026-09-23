// One search-result / token-menu row — the `CommandItem` frame with the ONE
// two-slot anatomy every hit shares: the marked label (the caller's `HighlightedText`, so a hit shows WHY it
// matched) and the muted CONTEXT beside it (the owning group's label, a token's hint). Split from the input
// so the results list, the token menu and the dynamic member rows cannot drift into three row grammars.
//
// THE TWO SLOTS ARE NAMED SEPARATELY (#1099 G5). Two adjacent inline boxes with no text node between them
// concatenate into ONE word in the accessibility tree: the live surface computed "Message styleAppearance"
// for every hit and "@modifiedonly settings that differ from their default" for every token — the browser's
// REAL names, not an instrument artifact (snap stopped welding hidden text in #877). A screen-reader user
// hears one nonsense word and voice control cannot target the row at all. `aria-labelledby` over the two
// ids joins them with a SPACE, which is both halves of the fix: the weld is gone, and every visible word is
// still in the name (§13.10 N2 — an `aria-label` of just the label would DROP the context, which is the
// WCAG 2.5.3 trap #1022 already paid for once on the chat-style cards).

import { CommandItem } from "@orb/ui/command";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";

export interface CommandRowProps {
  readonly value: string;
  readonly onSelect: () => void;
  /** The muted trailing context — the group label for a hit, the hint for a token. Absent for a group row
   *  (its label IS the group). */
  readonly context?: string;
  /** A state MARK on the row — today only "Modified" (#1099 F16 / Errand A). A THIRD named slot, not a
   *  decoration: it joins the accessible name after the context, so a reader who cannot see the token still
   *  hears which hits are the changed ones. Absent = the row has nothing to declare. */
  readonly mark?: string;
  readonly children: ReactNode;
}

export function CommandRow({ value, onSelect, context, mark, children }: CommandRowProps): ReactElement {
  const ids = useId();
  const labelId = `${ids}-label`;
  const contextId = `${ids}-context`;
  const markId = `${ids}-mark`;
  const named = [labelId, ...(context === undefined ? [] : [contextId]), ...(mark === undefined ? [] : [markId])];
  return (
    <CommandItem aria-labelledby={named.join(" ")} onSelect={onSelect} value={value}>
      <span id={labelId}>{children}</span>
      {context === undefined ? null : (
        <Text id={contextId} voice="gloss">
          {context}
        </Text>
      )}
      {mark === undefined ? null : (
        <Text data-slot="config-search-mark" id={markId} voice="kicker">
          {mark}
        </Text>
      )}
    </CommandItem>
  );
}
