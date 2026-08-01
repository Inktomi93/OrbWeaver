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
}

/** The aggregate readout for every section reporting into this host. */
export function SettingsSaveFooter({ onJumpToSection }: SettingsSaveFooterProps): ReactElement | null {
  const aggregate = useAggregateSaveStatus();
  const erroredIds = useErroredSaveSections();
  const firstErrored = erroredIds[0];

  if (aggregate === null) {
    return null;
  }
  if (aggregate === "error" && firstErrored !== undefined) {
    // A failed WRITE is urgent — assertive, so a screen reader interrupts (role="alert"), and the locator
    // stays a real focusable affordance.
    return (
      <Row gap="field" align="center" data-slot="settings-save-footer" role="alert">
        <Text size="micro" tone="muted">
          {erroredIds.length === 1 ? "A section failed to save —" : `${erroredIds.length} sections failed to save —`}
        </Text>
        <Button type="button" intent="ghost" size="sm" onClick={(): void => onJumpToSection(firstErrored)}>
          Show me
        </Button>
      </Row>
    );
  }
  return (
    <Row gap="field" align="center" data-slot="settings-save-footer" role="status" aria-live="polite">
      <Text size="micro" tone="muted">
        {aggregate === "saving" ? "Saving…" : "Saved"}
      </Text>
      {aggregate === "saving" ? null : (
        <Text size="micro" tone="muted">
          {SAVED_CAPTION}
        </Text>
      )}
    </Row>
  );
}
