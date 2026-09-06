// The Settings CONTENT pane's ONE aggregate save-status footer (SET-SEAMS §3, S3 — the settings shell's,
// re-homed under the config host with the group whose sections report into it). Sections REPORT their save
// lifecycle into the transient status store; this reads the fold (error > blocked > saving > saved) and
// renders it once below the pane column, so a decomposed pane shows ONE honest "Saved" instead of N stacked footers.
//
// `blocked` (a section whose invalid field is HOLDING its write) is a locate arm too, and it is the one this
// footer was actively lying about: a hosted section renders no inline status, so "Saved" was the only thing on screen while an over-cap prose override refused to save.
//
// READ-ONLY by ruling (D41): retry belongs to the session that owns the edit, so on `error` this offers to
// JUMP to the failing section (which renders its own inline retry at its anchor) — never a retry-all.
// Nothing reported ⇒ renders NOTHING, so a pane whose sections don't report is byte-identical to before.
//
// IT SPEAKS AT THE READING STEP, NOT THE SMALLEST ONE (#1099 F25). Every arm used to be the `gloss` voice —
// 10.5px, muted, the bottom of the type ramp — for the sentence that says whether the thing you just
// changed is SAFE. `label` is the step for a fact you are meant to read (13px, foreground), and it is one
// voice across all three arms so the receipt does not shrink when it turns out to be good news. The
// ALIGNMENT half of the same finding is the column's, not this component's: `config-content-surface.tsx`
// now puts the scroller and this row on ONE inline grid, so the receipt lands under the content it is
// about instead of 24px outside it.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { selectConfigSub, useAggregateSaveStatus, useBlockedSaveSections, useConfigSectionRegistry, useErroredSaveSections } from "#state";

/** Can a failing section's jump actually LAND? Every reporter used to be a registered section contribution,
 *  so the locator always resolved; a `surface`-mode group can report too (Connections → Model roles), and
 *  its id is not in the section registry — a jump would silently no-op and "Show me" would be a button that
 *  does nothing. The footer asks the registry itself. */
function useSectionLocator(): { readonly canJumpToSection: (sectionId: string) => boolean; readonly onJumpToSection: (sectionId: string) => void } {
  const registry = useConfigSectionRegistry();
  return {
    canJumpToSection: (sectionId: string): boolean => registry.has(sectionId),
    onJumpToSection: (sectionId: string): void => {
      if (!registry.has(sectionId)) {
        return;
      }
      const contribution = registry.get(sectionId);
      selectConfigSub(contribution.anchor, contribution.nav.id);
    },
  };
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
    <Row gap="field" align="center" data-slot="config-save-footer" role={role} {...(role === "status" ? { "aria-live": "polite" as const } : {})}>
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
export function ConfigSaveFooter(): ReactElement | null {
  const { canJumpToSection, onJumpToSection } = useSectionLocator();
  const aggregate = useAggregateSaveStatus();
  const erroredIds = useErroredSaveSections();
  const blockedIds = useBlockedSaveSections();
  const firstErrored = erroredIds[0];
  const firstBlocked = blockedIds[0];
  const locate = { canJumpToSection, onJumpToSection };

  if (aggregate === null) {
    return null;
  }
  if (aggregate === "unreadable") {
    // #1716: the stored settings blob cannot be read, so every section beneath this footer is refusing
    // identically and none of them is a place to jump TO — there is no locate arm, and the pane's own
    // `SettingsUnreadableGate` above the sections carries the REASON and the repair door. This line is the
    // aggregate STATE, and it exists because without it the footer read "Saved" over a pane where nothing
    // can be saved — the exact lie the `blocked` arm below was minted to kill, one rung more absolute.
    // Polite: it is a standing property of the stored row, true before the reader touched anything.
    return (
      <Row aria-live="polite" align="center" data-slot="config-save-footer" gap="field" role="status">
        <Text className="text-destructive" voice="label">
          Not saved
        </Text>
        <Text voice="label">— your settings couldn't be read.</Text>
      </Row>
    );
  }
  if (aggregate === "error" && firstErrored !== undefined) {
    // A failed WRITE is urgent — assertive, so a screen reader interrupts (role="alert").
    const count = erroredIds.length === 1 ? "A section" : `${erroredIds.length} sections`;
    return (
      <LocateRow role="alert" sectionId={firstErrored} {...locate}>
        <Text voice="label">{`${count} failed to save${canJumpToSection(firstErrored) ? " —" : "."}`}</Text>
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
        <Text className="text-destructive" voice="label">
          Not saved
        </Text>
        <Text voice="label">{`— ${count}${canJumpToSection(firstBlocked) ? "" : "."}`}</Text>
      </LocateRow>
    );
  }
  // "Saved" alone (#104 item 2, owner-ruled 2026-08-16). The trailing "· Synced across your devices." was
  // a SaaS promise this box does not make: orbweaver is a self-hosted single-user instance, and the
  // settings blob is saved to the box you are already looking at. Nothing was "synced", and no other
  // device exists to sync to. The word "Saved" is the whole true statement.
  return (
    <Row gap="field" align="center" data-slot="config-save-footer" role="status" aria-live="polite">
      <Text voice="label">{aggregate === "saving" ? "Saving…" : "Saved"}</Text>
    </Row>
  );
}
