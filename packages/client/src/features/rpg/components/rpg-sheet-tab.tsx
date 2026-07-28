// The Sheet tab (Context-Panel-Program §4.4 lite trim) — the VIEWER's sheet: an attribute grid over the
// profile vocabulary (stat cells, the profile hint on `title`) + the pool defs. No skills list in lite (§4.4).
//
// The viewer's actor is the roster `user` ref matching `viewerUserId`. EDIT-in-place (§3.2): an attribute
// edits through `patchSheet` — host any actor OR a member their OWN `user` ref (the server gate), so the
// viewer's own grid is editable unless the read-only pill is up. A freeform profile (lite's default) has no
// attributes → the grid is empty and the tab explains it (the mechanical sheet is prose-steered).

import type { RpgActorView, RpgStatProfile } from "@orb/contracts/rpg";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { StatCell, TrackerChip } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { usePatchSheet } from "../hooks/use-rpg-mutations";

/** The roster actor that is the viewer's own `user` ref, or the first actor as a fallback (a solo lite game
 *  where the human plays through a character sheet still shows something). */
function viewerActor(actors: readonly RpgActorView[], viewerUserId: string): RpgActorView | undefined {
  return actors.find((a) => a.actorRef.kind === "user" && a.actorRef.userId === viewerUserId) ?? actors[0];
}

/** The hand-only progression LEVEL (§2.6) — `Level N`, editable-in-place for the sheet owner/host. A null level
 *  is omitted from a READ-ONLY view (nullable-honesty: no phantom "Level 0"); an editable view shows an empty
 *  field so the owner can SET it. A blank/non-numeric commit clears the level (null). */
function SheetLevel({ level, onEditLevel }: { readonly level: number | null; readonly onEditLevel?: (next: number | null) => void }): ReactElement | null {
  if (level === null && onEditLevel === undefined) {
    return null;
  }
  if (onEditLevel === undefined) {
    return (
      <Row gap="field" align="baseline" data-slot="sheet-level">
        <Text as="span" size="label" tone="muted" transform="caps" className="tracking-micro">
          Level
        </Text>
        <Text as="span" size="label" className="tabular-nums">
          {level}
        </Text>
      </Row>
    );
  }
  return (
    <Row gap="field" align="baseline" data-slot="sheet-level" className="flex-wrap">
      <TrackerChip
        label="Level"
        value={level === null ? "" : String(level)}
        onEditValue={(next: string): void => {
          const trimmed = next.trim();
          const n = Number.parseInt(trimmed, 10);
          onEditLevel(trimmed === "" || Number.isNaN(n) ? null : n);
        }}
      />
    </Row>
  );
}

export interface RpgSheetTabProps {
  readonly state: RpgPanelState;
}

/** The lite Sheet tab — the viewer's attribute grid + pool defs. */
export function RpgSheetTab({ state }: RpgSheetTabProps): ReactElement {
  const { tracker, game, viewerUserId, isHost, chatId } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const patchSheet = usePatchSheet({ trpc, invalidation });

  const actor = viewerActor(tracker.actors, viewerUserId);
  if (actor === undefined) {
    return <Text tone="muted">No sheet yet — add characters in Members.</Text>;
  }
  // A member may edit only their OWN `user` sheet; a host may edit any. Cast actors have no sheet.
  const ownRow = actor.actorRef.kind === "user" && actor.actorRef.userId === viewerUserId;
  const canEdit = !game.trackersReadOnly && (isHost || ownRow) && actor.actorRef.kind !== "cast";

  const profile: RpgStatProfile = game.publicConfig.statProfile;
  const attrDefs = profile.attributes;

  return (
    <Stack gap="section" data-slot="rpg-sheet-tab">
      <Text size="label" tone="muted" transform="caps" className="tracking-micro">
        {actor.name}
        {actor.sheet.className === "" ? "" : ` — ${actor.sheet.className}`}
      </Text>

      <SheetLevel
        level={actor.sheet.level}
        {...(canEdit
          ? {
              onEditLevel: (next: number | null): void => {
                patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { level: next } });
              },
            }
          : {})}
      />

      {attrDefs.length === 0 ? (
        <Text tone="muted">This game steers on prose — no attribute sheet to fill.</Text>
      ) : (
        <Grid cols="tile" gap="field">
          {attrDefs.map((def) => (
            <StatCell
              key={def.key}
              label={def.label}
              value={actor.sheet.attributes[def.key] ?? profile.range.min}
              {...(def.hint === "" ? {} : { hint: def.hint })}
              {...(canEdit
                ? {
                    onEditValue: (next: number): void => {
                      patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: { attributes: { [def.key]: next } } });
                    },
                  }
                : {})}
            />
          ))}
        </Grid>
      )}

      {actor.sheet.poolDefs.length === 0 ? null : (
        <Stack gap="field">
          <Text size="label" tone="muted" transform="caps" className="tracking-micro">
            Pools
          </Text>
          {actor.sheet.poolDefs.map((pool) => (
            <Row key={pool.name} gap="block" align="baseline" justify="between">
              <Text as="span" size="label" tone="muted">
                {pool.name}
              </Text>
              <Text as="span" size="label" className="tabular-nums">
                max {pool.max}
              </Text>
            </Row>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
