// The settings shell's ONE aggregate save-status footer (SET-SEAMS §3, S3). Sections REPORT their save
// lifecycle into the transient status store; this reads the fold (error > blocked > saving > saved) and
// renders it once below the pane column, so a decomposed pane shows ONE honest "Saved · Synced across your
// devices." instead of N stacked footers.
//
// `blocked` (a section whose invalid field is HOLDING its write) is a locate arm too, and it is the one this
// footer was actively lying about: a hosted section renders no inline status, so "Saved · Synced across your
// devices." was the only thing on screen while an over-cap prose override refused to save.
//
// READ-ONLY by ruling (D41): retry belongs to the session that owns the edit, so on `error` this offers to
// JUMP to the failing section (which renders its own inline retry at its anchor) — never a retry-all.
// Nothing reported ⇒ renders NOTHING, so a pane whose sections don't report is byte-identical to before.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useAggregateSaveStatus, useBlockedSaveSections, useErroredSaveSections } from "#state";

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

/** The locate arm both attention states share: a sentence + the "Show me" that lands on the section. The
 *  sentence CLOSES itself when there is no landable target ("." instead of "—"), so it never trails into a
 *  button that isn't there — the em-dash is a promise the affordance keeps. */
function LocateRow({
  children,
  role,
  sectionId,
  canJumpToSection,
  onJumpToSection,
}: {
  readonly children: ReactNode;
  readonly role: "alert" | "status";
  readonly sectionId: string;
  readonly canJumpToSection: (sectionId: string) => boolean;
  readonly onJumpToSection: (sectionId: string) => void;
}): ReactElement {
  return (
    <Row gap="field" align="center" data-slot="settings-save-footer" role={role} {...(role === "status" ? { "aria-live": "polite" as const } : {})}>
      {children}
      {canJumpToSection(sectionId) ? (
        <Button type="button" intent="ghost" size="sm" onClick={(): void => onJumpToSection(sectionId)}>
          Show me
        </Button>
      ) : null}
    </Row>
  );
}

/** The aggregate readout for every section reporting into this host. */
export function SettingsSaveFooter({ onJumpToSection, canJumpToSection }: SettingsSaveFooterProps): ReactElement | null {
  const aggregate = useAggregateSaveStatus();
  const erroredIds = useErroredSaveSections();
  const blockedIds = useBlockedSaveSections();
  const firstErrored = erroredIds[0];
  const firstBlocked = blockedIds[0];
  const locate = { canJumpToSection, onJumpToSection };

  if (aggregate === null) {
    return null;
  }
  if (aggregate === "error" && firstErrored !== undefined) {
    // A failed WRITE is urgent — assertive, so a screen reader interrupts (role="alert").
    const count = erroredIds.length === 1 ? "A section" : `${erroredIds.length} sections`;
    return (
      <LocateRow role="alert" sectionId={firstErrored} {...locate}>
        <Text voice="gloss">{`${count} failed to save${canJumpToSection(firstErrored) ? " —" : "."}`}</Text>
      </LocateRow>
    );
  }
  if (aggregate === "blocked" && firstBlocked !== undefined) {
    // A HELD write, not a failed one (side-eye PROSE-LIMIT P2). In a hosted pane the reporting section renders
    // NO inline status, so this footer was the whole affordance — and it read "Saved · Synced across your
    // devices." while a section's own field was refusing to save. Polite, not assertive: nothing broke, and
    // the field carrying the REASON already announces itself. Locate, never retry (D41) — a retry on an
    // invalid form is a no-op wearing a button.
    //
    // "Not saved" is the SAME two words the section-level status uses, so a reader meeting this at the pane
    // footer and then at the section's own header is told one thing once. The count is what the aggregate adds.
    const count = blockedIds.length === 1 ? "a section needs a fix" : `${blockedIds.length} sections need a fix`;
    return (
      <LocateRow role="status" sectionId={firstBlocked} {...locate}>
        <Text className="text-destructive" voice="gloss">
          Not saved
        </Text>
        <Text voice="gloss">{`— ${count}${canJumpToSection(firstBlocked) ? "" : "."}`}</Text>
      </LocateRow>
    );
  }
  return (
    <Row gap="field" align="center" data-slot="settings-save-footer" role="status" aria-live="polite">
      <Text voice="gloss">{aggregate === "saving" ? "Saving…" : "Saved"}</Text>
      {aggregate === "saving" ? null : <Text voice="gloss">{SAVED_CAPTION}</Text>}
    </Row>
  );
}
