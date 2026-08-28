// The composer textarea's keydown POLICY — the pure glue between the OPEN slash strip's combobox keys and the
// enterSends send pref. Extracted from `components/composer.tsx` for `component-size`; it was already module
// scope there (not a closure) precisely so its branching stays OUT of the component's cognitive-complexity
// budget, so the move is a relocation, not a refactor. Classification stays the pure `resolveSlashKey`
// (`lib/slash-command.ts`); this only translates the resolved action into effects + `preventDefault` and
// reports whether it consumed the event (the composer then skips its native send path).

import type { KeyboardEvent } from "react";
import type { SlashCommandContribution } from "#lib";
import { shouldSendOnEnter } from "./composer-send-keys.ts";
import { nextSlashHighlight, resolveSlashKey } from "./slash-command.ts";

export interface SlashStripKeyDeps {
  readonly open: boolean;
  readonly matches: readonly SlashCommandContribution[];
  readonly highlighted: SlashCommandContribution | undefined;
  readonly setHighlight: (updater: (prev: number) => number) => void;
  /** Completes the draft to the picked command's token (the click path's effect). */
  readonly pick: (command: SlashCommandContribution) => void;
  readonly unavailableFor: (command: SlashCommandContribution) => string | null;
  /** Surfaces an UNAVAILABLE offer's reason instead of completing it (the disabled-affordance law). */
  readonly setNotice: (reason: string) => void;
}

// Complete a keyboard-selected offer, OR refuse an UNAVAILABLE one with its reason (never completing) — the
// same law the click path gets from the Button's `disabled`; a keyboard user must not force what a click can't.
function pickOrRefuse(command: SlashCommandContribution, deps: SlashStripKeyDeps): void {
  const reason = deps.unavailableFor(command);
  if (reason === null) {
    deps.pick(command);
  } else {
    deps.setNotice(reason);
  }
}

function handleSlashStripKey(event: KeyboardEvent<HTMLTextAreaElement>, deps: SlashStripKeyDeps): boolean {
  if (!deps.open) {
    return false;
  }
  // The pure lib resolves the key into an offer to complete and/or a highlight step (no exported union — §7.4).
  // A completed offer consumes the event even if unavailable (pickOrRefuse surfaces its reason), so Tab/Enter
  // never fall through to send.
  const { pick, cycle } = resolveSlashKey(
    { key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing },
    deps.matches,
    deps.highlighted,
  );
  if (pick !== undefined) {
    event.preventDefault();
    pickOrRefuse(pick, deps);
    return true;
  }
  if (cycle !== undefined) {
    event.preventDefault();
    deps.setHighlight((prev) => nextSlashHighlight(prev, cycle, deps.matches.length));
    return true;
  }
  return false;
}

// The composer textarea's whole keydown policy — the strip's keys win first (when it's open), otherwise the
// enterSends pref decides whether Enter submits.
export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  deps: { readonly strip: SlashStripKeyDeps; readonly enterSends: boolean; readonly submit: () => void },
): void {
  if (handleSlashStripKey(event, deps.strip)) {
    return;
  }
  const sends = shouldSendOnEnter(
    { key: event.key, shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, isComposing: event.nativeEvent.isComposing },
    deps.enterSends,
  );
  if (sends) {
    event.preventDefault();
    deps.submit();
  }
}
