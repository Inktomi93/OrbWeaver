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

import type { RpgActorRef, RpgActorView, RpgTrackerView } from "@orb/contracts/rpg";
import { resolveTrackerMaxOverride, trackerNumber } from "@orb/contracts/rpg";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { RelationshipBadge } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot } from "../hooks/use-rpg-mutations";
import { actorKey } from "../lib/actor-key";
import { actorLockBase, actorStatePatch, writeTrackerValue } from "../lib/volatile-patch";
import type { ActorEdit } from "./rpg-actor-trackers";
import { ActorMeters, ActorTrackerRows, ConditionChips, StatusLine } from "./rpg-actor-trackers";
import { RpgCharacterDetail } from "./rpg-character-detail";
import { RpgFieldLock } from "./rpg-field-lock";
import { Kicker } from "./rpg-kicker";
import { RpgVeiledSection } from "./rpg-veiled-section";

type ActorVolatile = NonNullable<RpgActorView["volatile"]>;

/** The scene-cast row this roster actor also stands in (the §12.2.3 relationship join) — or undefined.
 *  A `user` actor never joins (cast rows are NPCs), so its predicate matches nothing: no row, no badge. */
function castRowFor(actor: RpgActorView, cast: RpgTrackerView["cast"]): RpgTrackerView["cast"][number] | undefined {
  const ref = actor.actorRef;
  return cast.find((c) => (ref.kind === "character" ? c.characterId === ref.characterId : ref.kind === "cast" && c.key === ref.castKey));
}

export interface RpgStatusTabProps {
  readonly state: RpgPanelState;
}

/** The Status tab — the roster, or the character takeover when an entry is open. */
export function RpgStatusTab({ state }: RpgStatusTabProps): ReactElement {
  const { tracker, canEditShared, chatId, isHost } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });
  // The open character (the takeover) — null = the roster. Keyed by the stable roster selector key.
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (tracker.actors.length === 0) {
    return <Text>No one on the roster yet — add characters in Members.</Text>;
  }

  // One patch-and-mutate for a target actor's volatile (whole-array overlay, keyed server-side by
  // `actorRefKey`). Every write stamps its FINE lock path (#10 — `lockSub` appends to the actor's base).
  const patch = (ref: RpgActorRef, lockSub: string, mutate: (v: ActorVolatile) => ActorVolatile): void =>
    editSnapshot.mutate({ chatId, patch: actorStatePatch(tracker, ref, mutate), lockPaths: [`${actorLockBase(ref)}${lockSub}`] });

  const editFor = (actor: RpgActorView): ActorEdit | undefined => {
    if (!canEditShared) {
      return;
    }
    const ref = actor.actorRef;
    const base = actorLockBase(ref);
    return {
      onEditTracker: (key, next): void => patch(ref, `.trackerValues.${key}`, (v) => writeTrackerValue(v, key, { value: Math.max(0, next) })),
      onEditTrackerText: (key, next): void => {
        const def = actor.trackers.find((d) => d.key === key);
        const trimmed = next.trim();
        patch(ref, `.trackerValues.${key}`, (v) =>
          writeTrackerValue(v, key, def?.shape === "list" ? { items: trimmed === "" ? [] : trimmed.split(",").map((x) => x.trim()) } : { value: trimmed }),
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
        patch(ref, `.trackerValues.${key}`, (v) => writeTrackerValue(v, key, drag ? { max: override, value: clampedMax } : { max: override }));
        return drag ? { draggedTo: clampedMax } : null;
      },
      onAddCondition: (name): void =>
        patch(ref, ".conditions", (v) =>
          v.conditions.some((c) => c.name === name) ? v : { ...v, conditions: [...v.conditions, { name, stat: null, modifier: 0, turnsLeft: null }] },
        ),
      onRemoveCondition: (name): void => patch(ref, ".conditions", (v) => ({ ...v, conditions: v.conditions.filter((c) => c.name !== name) })),
      onEditStatus: (next): void => patch(ref, ".status", (v) => ({ ...v, status: next.trim() })),
      isLocked: (sub): boolean => tracker.lockedPaths.includes(`${base}${sub}`),
      onRelease: (sub): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [`${base}${sub}`] }),
    };
  };

  // THE TAKEOVER: the open character replaces the roster in the viewport (one panel, one place at a time).
  const openActor = tracker.actors.find((a) => actorKey(a) === openKey);
  if (openActor !== undefined) {
    const edit = editFor(openActor);
    return <RpgCharacterDetail state={state} actor={openActor} onBack={(): void => setOpenKey(null)} {...(edit === undefined ? {} : { edit })} />;
  }

  return (
    <Stack gap="section" data-slot="rpg-status-tab">
      {/* The section-scoped hand-lock pin (§12.3): a Status hand edit stamps the TOP-LEVEL `actorState`
          path (the whole-array overlay), so one lock ⇒ one pin ⇒ one Release, on the section label. */}
      <Kicker
        trailing={
          canEditShared && tracker.lockedPaths.includes("actorState") ? (
            <RpgFieldLock onRelease={(): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: ["actorState"] })} />
          ) : null
        }
      >
        Roster — {tracker.actors.length}
      </Kicker>
      {tracker.actors.map((actor) => {
        const edit = editFor(actor);
        return (
          <RpgStatusCard
            key={actorKey(actor)}
            actor={actor}
            cast={tracker.cast}
            onOpen={(): void => setOpenKey(actorKey(actor))}
            {...(edit === undefined ? {} : { edit })}
          />
        );
      })}
      {/* The host-only Veiled ledger (P3) — LIVE off `rpg.revealHidden` (its own boundary; empty/error ⇒
          null). PERMISSION-omit: a member never mounts it, so member DOM carries zero veiled content. */}
      {isHost ? <RpgVeiledSection chatId={chatId} /> : null}
    </Stack>
  );
}

interface RpgStatusCardProps {
  readonly actor: RpgActorView;
  readonly cast: RpgTrackerView["cast"];
  readonly edit?: ActorEdit;
  /** Open this character's takeover (the card's name is the door). */
  readonly onOpen: () => void;
}

/** One roster instrument card: portrait+name as the DOOR into the character · relationship badge · title ·
 *  status line · meters · condition chips. The name is a real button (the takeover's entry point); every
 *  other control on the card stays a sibling of it, never nested inside it. */
function RpgStatusCard({ actor, cast, edit, onOpen }: RpgStatusCardProps): ReactElement {
  const volatile = actor.volatile;
  const castRow = castRowFor(actor, cast);
  return (
    <Stack gap="field" data-slot="rpg-status-card" className="rounded-base border border-border bg-card px-block py-row">
      <Row gap="block" align="center" justify="between">
        <Row gap="field" align="center" className="min-w-0">
          <Button
            intent="ghost"
            size="sm"
            onClick={onOpen}
            aria-label={`Open ${actor.name}`}
            title={`Open ${actor.name}'s sheet`}
            className="!h-auto min-h-0 min-w-0 justify-start gap-field !px-field !py-0"
          >
            <Avatar size="md" shape="rounded" alt={actor.name} hueSeed={actor.name} {...(actor.avatar === undefined ? {} : { src: actor.avatar })}>
              {actor.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <Text as="span" voice="label" className="truncate">
              {actor.name}
            </Text>
            <Icon icon={ChevronRight} size="xs" className="shrink-0 text-muted-foreground" />
          </Button>
          {castRow === undefined ? null : <RelationshipBadge relationship={castRow.relationship} />}
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
