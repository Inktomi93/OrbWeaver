// The per-actor TRACKER-EXCEPTIONS editor (the applicability model, tracked-field-unification §5.1): the
// host's door to this actor's `sheet.trackerGrants` / `sheet.trackerRevokes`. A tracker DEF carries a carrier
// CLASS (`party`/`npcs`/`everyone`/an explicit list) resolved server-side; this surface lets the host make the
// two PER-ACTOR exceptions the class can't express — GRANT a tracker the class missed (the one-off "this one
// character alone carries Bound Will") or REVOKE one the class swept in (a party member with no Mana in a
// party-wide Mana game). Before it existed the owner's explicit-list-only ruling was a dead letter: the lists
// were stored + gated + optimistically merged, with no way for a host to author them.
//
// HOST-ONLY, NON-CAST: grants are the host's call (PERMISSION-omit at the parent — a member never sees a
// control that would refuse), and an `npc` actor has no sheet at all (its applicability rides the def's `npcs`
// class / explicit `appliesTo` list, not a per-actor exception), so the parent gates this to participant actors.
//
// The control is a tri-state per def — By class / Granted / Revoked — which maps 1:1 onto the stored exception
// pair (the ONE mental model the sheet keeps), never a re-derivation of carriage: whether the actor ACTUALLY
// carries the tracker after the exception is the server's `carriesTracker` verdict, surfaced read-only here as
// the `actor.trackers` set (the panel "never re-derives carriage itself", views.ts). The write is the same
// whole-list `patchSheet` replace every sheet field makes; a REVOKE beats a grant (the resolver's rule), so
// the two lists are kept disjoint per key.

import type { RpgActorView, RpgTrackerDef } from "@orb/contracts/rpg";
import { sortTrackers } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { useInvalidation, useTRPC } from "#data";
import { usePatchSheet } from "../hooks/use-rpg-mutations.ts";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { Kicker } from "./rpg-kicker.tsx";

/** The picker options, in escalation order — the ONE source for the axis. `By class` reads as the honest
 *  baseline (no exception); the two overrides name the stored lists in host vocabulary. */
const EXCEPTION_OPTIONS = [
  { label: "By class", value: "default" },
  { label: "Granted", value: "grant" },
  { label: "Revoked", value: "revoke" },
] as const;

/** The three exception states, DERIVED from the options (spine §5.5 — never a re-declared literal union), 1:1
 *  with the stored pair: `default` = key in neither list (carriage decided by the def's class), `grant` = key
 *  in `trackerGrants`, `revoke` = key in `trackerRevokes`. */
type Exception = (typeof EXCEPTION_OPTIONS)[number]["value"];

/** Narrow the Select's `string | null` back to the closed axis — a picker over the fixed option set can only
 *  ever hand back one of these, but the type has to be earned, not asserted. */
function asException(value: string | null): Exception | null {
  return EXCEPTION_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

/** This actor's current exception for one tracker key: a revoke wins the display exactly as it wins the
 *  resolver (`carriesTracker`), then a grant, else the class baseline. */
function exceptionFor(key: string, grants: readonly string[], revokes: readonly string[]): Exception {
  if (revokes.includes(key)) {
    return "revoke";
  }
  if (grants.includes(key)) {
    return "grant";
  }
  return "default";
}

/** The whole-list replacement for setting one key's exception: drop the key from BOTH lists, then re-add it to
 *  the one the new state names (or neither for `default`). Disjoint-by-construction, so the stored pair can
 *  never claim a key is both granted and revoked. */
function applyException(
  key: string,
  next: Exception,
  grants: readonly string[],
  revokes: readonly string[],
): { readonly trackerGrants: string[]; readonly trackerRevokes: string[] } {
  const clearedGrants = grants.filter((k) => k !== key);
  const clearedRevokes = revokes.filter((k) => k !== key);
  return {
    trackerGrants: next === "grant" ? [...clearedGrants, key] : clearedGrants,
    trackerRevokes: next === "revoke" ? [...clearedRevokes, key] : clearedRevokes,
  };
}

/** The host's per-actor tracker grants/revokes editor. Renders only the ACTOR-subject defs (a `game`-subject
 *  tracker has no carriers, so no exception applies); the honest doorway when the game has none yet. */
export function TrackerGrantsEditor({
  chatId,
  actor,
  trackerDefs,
}: {
  readonly chatId: ChatId;
  readonly actor: RpgActorView;
  readonly trackerDefs: readonly RpgTrackerDef[];
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const patchSheet = usePatchSheet({ trpc, invalidation });
  // One id base for the row OUTCOME badges (side-eye P3): each row's picker points at its own badge through
  // `aria-describedby`, so focusing the control announces the resolved outcome ("Carries") and not just the
  // exception state ("By class") — the two are different facts, and the outcome is the one the host is
  // actually deciding about. It describes the VISIBLE badge rather than duplicating it into hidden text.
  // Suffixed by `def.key`, which is slug-safe by construction (`mintDefKey` emits `[a-z0-9_]` only), so it is
  // always a valid id fragment.
  const outcomeIdBase = useId();
  const actorDefs = sortTrackers(trackerDefs.filter((def) => def.subject === "actor"));
  const grants = actor.sheet.trackerGrants;
  const revokes = actor.sheet.trackerRevokes;
  // Server-resolved carriage (post grants/revokes) — the read-only outcome hint, never a client re-derivation.
  const carriedKeys = new Set(actor.trackers.map((def) => def.key));
  return (
    <Stack gap="field" data-slot="rpg-tracker-grants">
      <Kicker>Tracker access</Kicker>
      {actorDefs.length === 0 ? (
        <RpgDoorwayLine>No character trackers yet — the host defines them in the Game tab, and grants or revokes them per character here.</RpgDoorwayLine>
      ) : (
        <Stack gap="field">
          <Text as="span" voice="gloss">
            Who carries each tracker is decided by its class. Grant one this character alone should carry, or revoke one the class swept in.
          </Text>
          {actorDefs.map((def) => {
            const current = exceptionFor(def.key, grants, revokes);
            const carried = carriedKeys.has(def.key);
            const outcomeId = `${outcomeIdBase}-${def.key}`;
            return (
              <Row key={def.key} gap="field" align="center" className="flex-wrap" data-slot="rpg-tracker-grant-row" data-tracker-key={def.key}>
                {/* A long host-authored label ellipsizes in this column, so it carries its full text on
                    `title` — the mouse-hover recovery a truncated datum owes the reader (side-eye P3). */}
                <Text as="span" voice="label" className="min-w-0 flex-1 truncate" data-slot="rpg-tracker-grant-label" title={def.label}>
                  {def.label}
                </Text>
                <Badge id={outcomeId} intent={carried ? "success" : "neutral"} size="sm" tone="soft" data-slot="rpg-tracker-grant-outcome">
                  {carried ? "Carries" : "Doesn't carry"}
                </Badge>
                <Select
                  aria-label={`${def.label} access for ${actor.name}`}
                  aria-describedby={outcomeId}
                  items={EXCEPTION_OPTIONS}
                  value={current}
                  onValueChange={(next): void => {
                    const picked = asException(next);
                    if (picked !== null && picked !== current) {
                      patchSheet.mutate({ chatId, actorRef: actor.actorRef, patch: applyException(def.key, picked, grants, revokes) });
                    }
                  }}
                />
              </Row>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
