// The settings shell's ONE aggregate save-status footer (SET-SEAMS §3, S3). Sections REPORT their save
// lifecycle into the transient status store; this reads the fold (error > saving > saved) and renders it
// once below the pane column, so a decomposed pane shows ONE honest "Saved · Synced across your devices."
// instead of N stacked footers.
//
// READ-ONLY by ruling (D41): retry belongs to the session that owns the edit, so on `error` this offers to
// JUMP to the failing section (which renders its own inline retry at its anchor) — never a retry-all.
// Nothing reported ⇒ renders NOTHING, so a pane whose sections don't report is byte-identical to before.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useAggregateSaveStatus, useErroredSaveSections } from "#state";

const SAVED_CAPTION = "Synced across your devices.";

export interface SettingsSaveFooterProps {
  /** Select + scroll to a reporting section by its contribution id (the shell's `jumpToSection`). */
  readonly onJumpToSection: (sectionId: string) => void;
  /**
   * Can that jump actually LAND? Every reporter used to be a registered section contribution, so the
   * locator always resolved; a `surface`-mode pane can now report too (Connections → Model roles), and its
   * id is not in the section registry — `jumpToSection` would silently no-op and "Show me" would be a
   * button that does nothing. Required, not optional: the host is the only thing that knows.
   */
  readonly canJumpToSection: (sectionId: string) => boolean;
}

/** The aggregate readout for every section reporting into this host. */
export function SettingsSaveFooter({ onJumpToSection, canJumpToSection }: SettingsSaveFooterProps): ReactElement | null {
  const aggregate = useAggregateSaveStatus();
  const erroredIds = useErroredSaveSections();
  const firstErrored = erroredIds[0];

  if (aggregate === null) {
    return null;
  }
  if (aggregate === "error" && firstErrored !== undefined) {
    // A failed WRITE is urgent — assertive, so a screen reader interrupts (role="alert"), and the locator
    // stays a real focusable affordance. Without a landable target the sentence CLOSES itself instead of
    // trailing into a dead button — the em-dash is a promise the "Show me" keeps.
    const locatable = canJumpToSection(firstErrored);
    const count = erroredIds.length === 1 ? "A section" : `${erroredIds.length} sections`;
    return (
      <Row gap="field" align="center" data-slot="settings-save-footer" role="alert">
        <Text voice="gloss">{`${count} failed to save${locatable ? " —" : "."}`}</Text>
        {locatable ? (
          <Button type="button" intent="ghost" size="sm" onClick={(): void => onJumpToSection(firstErrored)}>
            Show me
          </Button>
        ) : null}
      </Row>
    );
  }
  return (
    <Row gap="field" align="center" data-slot="settings-save-footer" role="status" aria-live="polite">
      <Text voice="gloss">{aggregate === "saving" ? "Saving…" : "Saved"}</Text>
      {aggregate === "saving" ? null : <Text voice="gloss">{SAVED_CAPTION}</Text>}
    </Row>
  );
}
