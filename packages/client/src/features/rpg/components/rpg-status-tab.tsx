// The STATUS tab (panel-redesign DESIGN.md §4 "Status" + the tracked-field unification §3 IA repair):
// **the ONLY list of people**, and expanding an entry IS the sheet. Two states, one tab:
//   • the ROSTER — portrait-led instrument cards (D44 portrait · name · relationship badge ON the name line,
//     rendered ONLY when the roster character also stands in the scene cast, §12.2.3 — never a phantom
//     "neutral") with the quick edits that belong on a glanceable row: the volatile `status` line, the
//     tracker meters (value AND max click-to-edit), the lit condition chips;
//   • the CHARACTER TAKEOVER (`RpgCharacterDetail`) — the whole character, breadcrumb back to the roster.
// Sheet-the-tab dissolved into that second state (SETTLED, owner 2026-07-31): its title/level/wallet/
// attribute planes live in the takeover, its tracker DEF rows moved to the Game tab's one def home.
//
// VEILED (P3, §6) — the host-only standing-secrets ledger is a WIRED-WHEN-READY section shell
// (`RpgVeiledSection`): the deception plane is being built by its own lane; until entries arrive the
// shell renders NOTHING (the honest empty plane — no filler). The section + crown-gold grammar land here
// because secrets are game-state about the ROSTER (the same lens this tab already is).
//
// The per-actor edit callbacks (`ActorEdit`) are built ONCE here and handed to whichever state is showing —
// the roster card and the takeover write through the same overlays, so a value edited in one place is the
// same write in the other.

import type { RpgActorOp, RpgActorRef, RpgActorView } from "@orb/contracts/rpg";
import { resolveTrackerMaxOverride, rpgActorLockBase, trackerNumber } from "@orb/contracts/rpg";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, usePatchActor } from "../hooks/use-rpg-mutations";
import { actorKey } from "../lib/actor-key";
import type { ActorEdit } from "./rpg-actor-trackers";
import { ActorMeters, ActorTrackerRows, ConditionChips, StatusLine } from "./rpg-actor-trackers";
import { RpgCharacterDetail } from "./rpg-character-detail";
import { RpgFieldLock } from "./rpg-field-lock";
import { Kicker } from "./rpg-kicker";
import { RpgVeiledSection } from "./rpg-veiled-section";

export interface RpgStatusTabProps {
  readonly state: RpgPanelState;
}

/** The Status tab — the roster, or the character takeover when an entry is open. */
export function RpgStatusTab({ state }: RpgStatusTabProps): ReactElement {
  const { tracker, canEditShared, chatId, isHost } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });
  const patchActor = usePatchActor({ trpc, invalidation });
  // The open character (the takeover) — null = the roster. Keyed by the stable roster selector key.
  const [openKey, setOpenKey] = useState<string | null>(null);

  // THE ROSTER, and only the roster (R2). `tracker.actors` now carries every actor the game tracks, cast NPCs
  // included — one shape, so the filter is a partition, not a projection. Cast actors home on the SCENE tab
  // (on stage) and in its Known-characters disclosure (offstage); duplicating them here would give one person
  // two edit homes, which is the dual-homing rule this IA exists to obey.
  const roster = tracker.actors.filter((a) => a.actorRef.kind !== "cast");

  if (roster.length === 0) {
    return <Text>No one on the roster yet — add characters in Members.</Text>;
  }

  // One op-and-mutate for a target actor's volatile: the panel names the OP it performed, the server applies
  // it against the true head and derives the FINE lock path (#10). No image, no client-named lock paths.
  const patch = (ref: RpgActorRef, ...ops: readonly RpgActorOp[]): void => patchActor.mutate({ chatId, targetRef: ref, ops: [...ops] });

  const editFor = (actor: RpgActorView): ActorEdit | undefined => {
    if (!canEditShared) {
      return;
    }
    const ref = actor.actorRef;
    const base = rpgActorLockBase(ref);
    return {
      onEditTracker: (key, next): void => patch(ref, { op: "setTracker", key, value: { value: Math.max(0, next) } }),
      onEditTrackerText: (key, next): void => {
        const def = actor.trackers.find((d) => d.key === key);
        const trimmed = next.trim();
        patch(
          ref,
          def?.shape === "list"
            ? { op: "setTracker", key, value: { items: trimmed === "" ? [] : trimmed.split(",").map((x) => x.trim()) } }
            : { op: "setTracker", key, value: { value: trimmed } },
        );
      },
      onEditTrackerMax: (key, nextMax): { readonly draggedTo: number } | null => {
        const clampedMax = Math.max(1, nextMax); // the real `max ≥ 1` floor (§12.3 Tier-1)
        const def = actor.trackers.find((d) => d.key === key);
        const reading = trackerNumber(actor.volatile?.trackerValues[key]);
        // THIS character's ceiling (owner amendment): the override rides the actor's own value plane, and
        // resolves to `null` when it equals the game default — one gesture, one write, no drift class.
        const override = def === undefined ? clampedMax : resolveTrackerMaxOverride(def, clampedMax);
        // Lowering below the reading drags the stored VALUE down in the SAME commit (never a silent truncate).
        const drag = reading !== null && reading > clampedMax;
        patch(ref, { op: "setTracker", key, value: drag ? { max: override, value: clampedMax } : { max: override } });
        return drag ? { draggedTo: clampedMax } : null;
      },
      // `addCondition` is a name-keyed UPSERT server-side, so re-adding a standing condition is idempotent —
      // the panel no longer has to check the list before writing.
      onAddCondition: (name): void => patch(ref, { op: "addCondition", condition: { name } }),
      onRemoveCondition: (name): void => patch(ref, { op: "removeCondition", name }),
      onEditStatus: (next): void => patch(ref, { op: "setStatus", status: next.trim() }),
      isLocked: (sub): boolean => tracker.lockedPaths.includes(`${base}${sub}`),
      onRelease: (sub): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [`${base}${sub}`] }),
    };
  };

  // THE TAKEOVER: the open character replaces the roster in the viewport (one panel, one place at a time).
  const openActor = roster.find((a) => actorKey(a) === openKey);
  if (openActor !== undefined) {
    const edit = editFor(openActor);
    return <RpgCharacterDetail state={state} actor={openActor} onBack={(): void => setOpenKey(null)} {...(edit === undefined ? {} : { edit })} />;
  }

  return (
    <Stack gap="section" data-slot="rpg-status-tab">
      {/* The plane-wide hand-lock pin (§12.3). Nothing MINTS this coarse `actorState` pin any more — the ops
          door stamps fine per-datum paths — but a snapshot written before R1 can carry one, and a pin with no
          Release is a trap: the section keeps the affordance so a stored plane-wide lock can be let go. */}
      <Kicker
        trailing={
          canEditShared && tracker.lockedPaths.includes("actorState") ? (
            <RpgFieldLock field="the roster" onRelease={(): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: ["actorState"] })} />
          ) : null
        }
      >
        Roster — {roster.length}
      </Kicker>
      {roster.map((actor) => {
        const edit = editFor(actor);
        return <RpgStatusCard key={actorKey(actor)} actor={actor} onOpen={(): void => setOpenKey(actorKey(actor))} {...(edit === undefined ? {} : { edit })} />;
      })}
      {/* The host-only Veiled ledger (P3) — LIVE off `rpg.revealHidden` (its own boundary; empty/error ⇒
          null). PERMISSION-omit: a member never mounts it, so member DOM carries zero veiled content. */}
      {isHost ? <RpgVeiledSection chatId={chatId} /> : null}
    </Stack>
  );
}

interface RpgStatusCardProps {
  readonly actor: RpgActorView;
  readonly edit?: ActorEdit;
  /** Open this character's takeover (the card's name is the door). */
  readonly onOpen: () => void;
}

/** One roster instrument card: portrait+name as the DOOR into the character · title · status line · meters ·
 *  condition chips. The name is a real button (the takeover's entry point); every other control on the card
 *  stays a sibling of it, never nested inside it.
 *
 *  There is no relationship badge here (R2). It joined a roster character to a scene-cast row by
 *  `presentCharacters[].characterId` — a field NO writer in the tree ever set, so the badge rendered for
 *  nobody. A stance is a CAST actor's datum (it lives on `identity`, and the Scene card is its home); a roster
 *  member's relationship to the player is the story's, not a tracked plane's. */
function RpgStatusCard({ actor, edit, onOpen }: RpgStatusCardProps): ReactElement {
  const volatile = actor.volatile;
  return (
    <Stack gap="field" data-slot="rpg-status-card" className="rounded-base border border-border bg-card px-block py-row">
      <Row gap="block" align="center" justify="between">
        <Row gap="field" align="center" className="min-w-0">
          <Button
            intent="ghost"
            size="inline"
            onClick={onOpen}
            aria-label={`Open ${actor.name}`}
            title={`Open ${actor.name}'s sheet`}
            className="min-w-0 px-field font-medium"
          >
            <Avatar size="md" shape="rounded" alt={actor.name} hueSeed={actor.name} {...(actor.avatar === undefined ? {} : { src: actor.avatar })}>
              {actor.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <Text as="span" voice="label" className="truncate">
              {actor.name}
            </Text>
            <Icon icon={ChevronRight} size="xs" className="shrink-0 text-muted-foreground" />
          </Button>
        </Row>
        {actor.sheet.className === "" ? null : (
          <Text as="span" voice="gloss" className="shrink-0">
            {actor.sheet.className}
          </Text>
        )}
      </Row>
      <StatusLine status={volatile?.status ?? ""} {...(edit === undefined ? {} : { edit })} />

      <ActorMeters actor={actor} {...(edit === undefined ? {} : { edit })} />
      <ActorTrackerRows actor={actor} {...(edit === undefined ? {} : { edit })} />

      <ConditionChips
        conditions={volatile?.conditions ?? []}
        {...(edit === undefined ? {} : { onAdd: edit.onAddCondition, onRemove: edit.onRemoveCondition, edit })}
      />
    </Stack>
  );
}
