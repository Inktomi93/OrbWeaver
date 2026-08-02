// The SCENE tab (panel-redesign DESIGN.md §4 "Scene" — the NOW window): AmbientStrip → present-cast
// CastCards → GOALS (a PROJECTION of the quest plane — active-only compact echo of the SAME `quests` rows
// the Quests tab homes, §12.1.8; one datum, two lenses) → subjectName-grouped custom widgets (accent rides
// the §12.1.2 ward: a stored `widget.accent` must pass the strict hex/OKLCH grammar, else it heals to the
// ordinal ramp) → the P5 CHOICE-echo shell (wired-when-ready — no choice plane exists; renders nothing
// until CYOA lands) → last-3 BeatLines ("Just now"). Scene = window; Journal = archive.
//
// EDIT-in-place (§3.2), all host-only in v1 (`canEditShared`, which also folds the read-only pill's honest
// arm): ambient fields + game-tracker values + the cast IDENTITY rows ride `editSnapshot` (record/array
// overlay under [merge-clear]); a cast member's TRACKED VALUES ride `patchActor` (the op door — a cast NPC's
// values live on the per-actor plane, which left the image contract in R1); goals ride `upsertQuest`. Beats
// are a log (read-only by nature).

import type {
  RpgActorOp,
  RpgActorRef,
  RpgActorView,
  RpgCastGuideField,
  RpgRelationship,
  RpgSnapshotState,
  RpgTrackerDef,
  RpgTrackerEntry,
  RpgTrackerView,
} from "@orb/contracts/rpg";
import {
  RPG_CAST_GUIDE_FIELDS,
  RPG_TRACKER_VALUE_EMPTY,
  RPG_WEATHER_TYPES,
  TIME_OF_DAY_HOURS,
  timeOfDayAtHour,
  trackerCeiling,
  trackerNumber,
  trackerReading,
} from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronRight, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { AmbientStrip, BeatLine, CastCard, GoalLine, MeterRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { revealContextPanel } from "#state";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useDismissActor, useEditSnapshot, usePatchActor, useResyncFromStory } from "../hooks/use-rpg-mutations";
import { actorKey } from "../lib/actor-key";
import { RELATIONSHIP_GLYPHS, TRACKER_SHAPE_GLYPHS } from "../lib/glyphs";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color";
import { RpgChoiceEcho } from "./rpg-choice-echo";
import { RpgDoorwayLine } from "./rpg-doorway-line";
import { RpgFieldLock } from "./rpg-field-lock";
import { Kicker } from "./rpg-kicker";
import { RpgSceneCards } from "./rpg-scene-cards";

const RECENT_BEATS = 3;

/** Build the `editSnapshot` overlay for one ambient field edit (§2.7 — timeOfDay steers the clock through
 *  the label→hour mapping). Returns `null` for an unknown timeOfDay label (no-op). */
function ambientPatch(field: "location" | "date" | "timeOfDay" | "weather", next: string, currentDay: number): Partial<RpgSnapshotState> | null {
  if (field === "location") {
    return { location: next };
  }
  if (field === "date") {
    return { calendarDate: next };
  }
  if (field === "weather") {
    // The strip's Weather control is the closed-vocab PICKER, so `next` is already one of the eight types;
    // an unknown string is a no-op rather than a write the snapshot's write-boundary would reject. The
    // label is CLEARED: the host just overrode the sky, so the model's old flavor phrasing would now lie.
    const picked = RPG_WEATHER_TYPES.find((t) => t === next);
    return picked === undefined ? null : { weather: { type: picked, label: "" } };
  }
  // Honest lookup (no cast): an unknown label reads `undefined` off the record, so the guard is meaningful.
  const hours: Readonly<Record<string, number | undefined>> = TIME_OF_DAY_HOURS;
  const hour = hours[next];
  return hour === undefined ? null : { clock: { day: currentDay, hour, minute: 0 } };
}

export interface RpgSceneTabProps {
  readonly state: RpgPanelState;
}

/** The ambient field → snapshot lock-path map (§12.3) — the domain knowledge that lives in the feature,
 *  not the shared AmbientStrip. A hand edit of `date` locks the `calendarDate` path, `timeOfDay` locks
 *  `clock`; `location`/`weather` are their own paths. */
const AMBIENT_LOCK_PATH: Readonly<Record<"location" | "date" | "timeOfDay" | "weather", keyof typeof LOCK_PATH_NAME>> = {
  location: "location",
  date: "calendarDate",
  timeOfDay: "clock",
  weather: "weather",
};

/** The Scene tab's edit callbacks, gated once on `canEditShared` (host on a game — hand edits are NOT
 *  gated by `trackersReadOnly`, D108). Splitting them out keeps the tab body under the complexity gate.
 *  NOTE (#39 dual-homing): goals are NOT edited here — the Quests tab is the quest plane's ONE edit home;
 *  a Scene goal row NAVIGATES there (`revealContextPanel("rpg.quests")`), never a second editor. */
interface SceneEditCallbacks {
  readonly onEditAmbient?: (field: "location" | "date" | "timeOfDay" | "weather", next: string) => void;
  readonly castEdit?: SceneCastEdit;
  readonly onEditGameTracker?: (entry: RpgTrackerEntry, next: number) => void;
  /** Release a hand-lock path back to the model (§12.3). Present only for a host (same gate as the edits). */
  readonly onReleaseLock?: (path: string) => void;
}

function useSceneEdits(state: RpgPanelState): SceneEditCallbacks {
  const { tracker, canEditShared, chatId } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });
  const patchActor = usePatchActor({ trpc, invalidation });
  const dismissActor = useDismissActor({ trpc, invalidation });
  if (!canEditShared) {
    return {};
  }
  const write = (targetRef: RpgActorRef, op: RpgActorOp): void => patchActor.mutate({ chatId, targetRef, ops: [op] });
  return {
    onEditAmbient: (field, next): void => {
      const patch = ambientPatch(field, next, tracker.ambient?.clock?.day ?? 1);
      if (patch !== null) {
        editSnapshot.mutate({ chatId, patch: patch as Record<string, unknown> });
      }
    },
    // EVERY cast edit is an OP on the actor's own row (R2) — identity and volatile alike. It used to be a
    // whole-`presentCharacters` IMAGE rebuilt from the live cast on every keystroke, which pinned the entire
    // plane on one NPC's mood edit and could only ever author the members this client could see.
    castEdit: {
      onEditIdentityText: (targetRef, field, text): void => write(targetRef, { op: "setIdentityText", field, text }),
      onEditRelationship: (targetRef, relationship): void => write(targetRef, { op: "setRelationship", relationship }),
      onEditTracker: (targetRef, def, next): void => {
        write(
          targetRef,
          def.shape === "list"
            ? {
                op: "setTracker",
                key: def.key,
                value: {
                  items: String(next)
                    .split(",")
                    .map((x) => x.trim()),
                },
              }
            : { op: "setTracker", key: def.key, value: { value: next } },
        );
      },
      onDismiss: (targetRef): void => dismissActor.mutate({ chatId, targetRef }),
    },
    // GAME-subject tracker values ride editSnapshot's `trackerValues` record, keyed by tracker KEY (never a
    // label — the old widget plane keyed by label, so a rename orphaned the value). The written value is TOTAL
    // (`{value,max,items}` whole) because the snapshot merge recurses into it.
    onEditGameTracker: (entry, next): void =>
      editSnapshot.mutate({
        chatId,
        patch: { trackerValues: { [entry.def.key]: { ...RPG_TRACKER_VALUE_EMPTY, ...entry.value, value: Math.max(0, next) } } },
      }),
    // Release-only edit: an empty patch + the lock path to clear (§12.3 — a lock is metadata, not a leaf).
    onReleaseLock: (path): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [path] }),
  };
}

/** Every lock path this tab can pin → the plane's name in the reader's words (side-eye 08-01: five pins on
 *  one tab all announced the same sentence). ONE map: a new lockable path fails `tsc` here, never ships mute. */
const LOCK_PATH_NAME = {
  presentCharacters: "the cast on stage",
  trackerValues: "the game trackers",
  location: "the location",
  calendarDate: "the date",
  clock: "the time of day",
  weather: "the weather",
} as const;

/** The section-scoped hand-lock pin (§12.3): `editSnapshot` stamps TOP-LEVEL patch paths, so one lock ⇒ one
 *  pin ⇒ one Release beside the section label, NAMED off the map above. `null` unless locked AND host. */
function sectionLockPin(locked: ReadonlySet<string>, path: keyof typeof LOCK_PATH_NAME, onReleaseLock: ((path: string) => void) | undefined): ReactNode {
  if (onReleaseLock === undefined || !locked.has(path)) {
    return null;
  }
  return <RpgFieldLock field={LOCK_PATH_NAME[path]} onRelease={(): void => onReleaseLock(path)} />;
}

/** The ambient card's props — the field values (nullable-honest), the edit callback, and the per-field
 *  lock pins (§12.3), split from the tab body for the complexity gate. */
function ambientStripProps(
  ambient: RpgTrackerView["ambient"],
  locked: ReadonlySet<string>,
  onEditAmbient: ((field: "location" | "date" | "timeOfDay" | "weather", next: string) => void) | undefined,
  onReleaseLock: ((path: string) => void) | undefined,
): Parameters<typeof AmbientStrip>[0] {
  return {
    ...(ambient !== null && ambient.location !== "" ? { location: ambient.location } : {}),
    ...(ambient !== null && ambient.calendarDate !== null ? { date: ambient.calendarDate } : {}),
    ...(ambient !== null && ambient.clock !== null ? { timeOfDay: timeOfDayAtHour(ambient.clock.hour) } : {}),
    ...(ambient !== null && ambient.weather !== null ? { weather: ambient.weather.type } : {}),
    ...(onEditAmbient === undefined ? {} : { onEditField: onEditAmbient }),
    // The pin + Release on a hand-locked ambient field (§12.3) — host-only (rides `onReleaseLock`).
    ...(onReleaseLock === undefined
      ? {}
      : {
          lockSlot: (field: "location" | "date" | "timeOfDay" | "weather"): ReactNode => sectionLockPin(locked, AMBIENT_LOCK_PATH[field], onReleaseLock),
        }),
  };
}

/** The lite Scene tab — ambient, cast, goals, the live choice echo, game trackers, beats. */
export function RpgSceneTab({ state }: RpgSceneTabProps): ReactElement {
  const { tracker } = state;
  const { onEditAmbient, castEdit, onEditGameTracker, onReleaseLock } = useSceneEdits(state);

  const beats = tracker.recentBeats.slice(-RECENT_BEATS).reverse();
  const locked = new Set(tracker.lockedPaths);
  const ambient = tracker.ambient;
  // ONE actor list, partitioned by presence (R2) — the same two-boolean split the reminder makes, so what the
  // host sees on stage and what the model is told are the same set by construction.
  const castActors = tracker.actors.filter((a) => a.actorRef.kind === "cast");
  const onStage = castActors.filter((a) => a.presence);
  const offstage = castActors.filter((a) => !a.presence);

  return (
    <Stack gap="section" data-slot="rpg-scene-tab">
      {ambient === null && onEditAmbient === undefined ? null : <AmbientStrip {...ambientStripProps(ambient, locked, onEditAmbient, onReleaseLock)} />}
      <SceneCast cast={onStage} {...(castEdit === undefined ? {} : { edit: castEdit })} lockPin={sectionLockPin(locked, "presentCharacters", onReleaseLock)} />
      <SceneKnownCharacters offstage={offstage} {...(castEdit === undefined ? {} : { edit: castEdit })} />
      {/* The Goals section is a filtered ECHO of the quest plane (§12.1.8): ACTIVE only, compact rows —
          the Quests tab is the plane's ONE edit home (#39 dual-homing). A goal row NAVIGATES there. */}
      <SceneGoals quests={tracker.quests.filter((q) => q.status === "active")} />
      <RpgChoiceEcho state={state} />
      <SceneGameTrackers
        trackers={tracker.gameTrackers}
        {...(onEditGameTracker === undefined ? {} : { onEditGameTracker })}
        lockPin={sectionLockPin(locked, "trackerValues", onReleaseLock)}
      />
      <SceneBeats beats={beats} />
      <RpgSceneCards chatId={state.chatId} enabled={state.game.publicConfig.immersiveHtml} />
      <SceneResyncDoorway state={state} />
    </Stack>
  );
}

/** The panel-doorway to the §1.3 host resync (HOST-only — rides `canEditShared`, the same shared-plane gate the
 *  edits use). Offered only when the scene reads STALE/EMPTY (no present cast AND no location) — the exact "panel
 *  out of sync?" state the escape hatch exists for. A member never sees it (the verb would refuse anyway; the gate
 *  keeps them from seeing a control that can't fire). The full control lives in the GM console; this is the
 *  discoverable inline pointer. */
function SceneResyncDoorway({ state }: { readonly state: RpgPanelState }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const resync = useResyncFromStory({ trpc, invalidation });
  const { tracker } = state;
  const sceneStale = tracker.cast.length === 0 && (tracker.ambient === null || tracker.ambient.location === "");
  if (!(state.canEditShared && sceneStale)) {
    return null;
  }
  return (
    <RpgDoorwayLine actionLabel={resync.isPending ? "Resyncing…" : "Resync from story →"} onAction={(): void => resync.mutate({ chatId: state.chatId })}>
      Panel out of sync with the story?
    </RpgDoorwayLine>
  );
}

/** The standing guides this actor actually carries (RV-11) — spread onto the card so an UNWRITTEN guide is
 *  simply absent (no line, never a "none" placeholder). The story authors them; the host may correct what is
 *  there, and there is nothing honest to show for one nobody has written. */
function guideProps(identity: NonNullable<RpgActorView["identity"]>): Partial<Record<RpgCastGuideField, string>> {
  const out: Partial<Record<RpgCastGuideField, string>> = {};
  for (const field of RPG_CAST_GUIDE_FIELDS) {
    const text = identity[field]?.trim() ?? "";
    if (text !== "") {
      out[field] = text;
    }
  }
  return out;
}

/** The host's writers for ONE cast actor's row (R2) — every one an OP against the actor's own ref, identity
 *  and volatile alike. The retired shape rebuilt the whole `presentCharacters` array on every keystroke. */
interface SceneCastEdit {
  /** Write one identity TEXT field (`mood`, a standing guide, the display `name` — the rename R2's slug key
   *  exists to make safe). The server pins the FINE `…identity.<field>` path, so pinning one NPC's mood no
   *  longer freezes the whole cast the way the plane-level `presentCharacters` lock did. */
  readonly onEditIdentityText: (targetRef: RpgActorRef, field: "name" | "mood" | RpgCastGuideField, text: string) => void;
  readonly onEditRelationship: (targetRef: RpgActorRef, relationship: RpgRelationship) => void;
  /** Write ONE tracked value on a cast actor. The CURRENT reading is not passed: `patchActor`'s `setTracker`
   *  merges onto whatever the true head carries, so the panel never hands back a value it read a beat ago. */
  readonly onEditTracker: (targetRef: RpgActorRef, def: RpgTrackerDef, next: string | number) => void;
  /** Drop this actor from the game entirely — state, presence and locks (`rpg.dismissActor`). */
  readonly onDismiss: (targetRef: RpgActorRef) => void;
}

/** ONE cast actor's card — identity, its carried trackers, its readings. Shared by the on-stage list and the
 *  Known-characters disclosure, because they are two views of ONE row (R2), never two shapes. */
function SceneCastCard({ actor, edit }: { readonly actor: RpgActorView; readonly edit?: SceneCastEdit }): ReactElement | null {
  const identity = actor.identity;
  if (identity === null) {
    return null;
  }
  // The trackers THIS actor carries, resolved server-side through the ONE carrier predicate — so the card
  // shows exactly the set the model's write schema offered for them (never a re-derivation).
  const values = actor.volatile?.trackerValues ?? {};
  const entries: RpgTrackerEntry[] = actor.trackers.map((def) => ({ def, value: values[def.key] ?? null }));
  const meters = entries.filter((e) => e.def.shape === "meter");
  const texts = entries
    .filter((e) => e.def.shape !== "meter")
    .map((e) => ({ name: e.def.label, value: trackerReading(e.def, e.value ?? undefined)?.replace(`${e.def.label}: `, "") ?? "" }));
  const ref = actor.actorRef;
  const editProps =
    edit === undefined
      ? {}
      : {
          onEditMood: (next: string): void => edit.onEditIdentityText(ref, "mood", next),
          onEditGuide: (field: RpgCastGuideField, next: string): void => edit.onEditIdentityText(ref, field, next),
          onEditRelationshipKind: (next: RpgRelationship["kind"]): void =>
            edit.onEditRelationship(ref, { kind: next, label: next === "custom" ? identity.relationship.label : "" }),
          onEditField: (label: string, next: string): void => {
            const entry = entries.find((e) => e.def.label === label);
            if (entry !== undefined) {
              edit.onEditTracker(ref, entry.def, next);
            }
          },
        };
  return (
    <CastCard
      name={actor.name}
      {...(identity.emoji === "" ? {} : { emoji: identity.emoji })}
      {...(identity.mood === "" ? {} : { mood: identity.mood })}
      {...guideProps(identity)}
      relationship={identity.relationship}
      fields={texts}
      // The relationship KIND glyph (the §12.5.5 closed-vocab Record) leads the edit-mode picker.
      relationshipGlyph={<Icon icon={RELATIONSHIP_GLYPHS[identity.relationship.kind]} size="xs" className="shrink-0 text-muted-foreground" />}
      {...editProps}
      {...(meters.length === 0
        ? {}
        : {
            meters: meters.map((m, i) => (
              <MeterRow
                key={m.def.key}
                label={m.def.label}
                // WHOSE meter — two cast cards on one tab otherwise offer two "Vitality value" buttons.
                subject={actor.name}
                // NULL stays null (side-eye 08-01): `?? 0` published "0/0" as this NPC's reading.
                value={trackerNumber(m.value ?? undefined)}
                // The EFFECTIVE ceiling (this carrier's override, else the def default) — one resolver.
                max={trackerCeiling(m.def, m.value ?? undefined)}
                // The def's own color, else the ordinal ramp — the SAME derivation the host-console
                // definition row and the band orb use (definition and display one system, §3).
                {...trackColorProps(resolveTrackerColor(m.def.color, i))}
                {...(edit === undefined ? {} : { onEditValue: (next: number): void => edit.onEditTracker(ref, m.def, Math.max(0, next)) })}
              />
            )),
          })}
    />
  );
}

function SceneCast({
  cast,
  edit,
  lockPin,
}: {
  readonly cast: readonly RpgActorView[];
  readonly edit?: SceneCastEdit;
  /** The section-scoped presence hand-lock pin (§12.3) — `null` when unlocked/not-host. */
  readonly lockPin?: ReactNode;
}): ReactElement {
  if (cast.length === 0) {
    // The honest empty-cast doorway (§12.1.5): the scene fills from the story; nothing to author by hand here.
    return <RpgDoorwayLine>No one on stage yet — the story brings them in.</RpgDoorwayLine>;
  }

  return (
    <Stack gap="field">
      <Kicker trailing={lockPin}>On stage — {cast.length}</Kicker>
      {cast.map((actor) => (
        <SceneCastCard key={actorKey(actor)} actor={actor} {...(edit === undefined ? {} : { edit })} />
      ))}
    </Stack>
  );
}

/** THE KNOWN-CHARACTERS DISCLOSURE (R2) — every cast actor the game has met who is NOT on stage.
 *
 *  This section is the visible half of the reshape. Departure used to DESTROY an NPC's identity while keeping
 *  her tracked state in a plane no surface projected, so the state was simultaneously permanent and invisible:
 *  the host could not see her, edit her, or remove her, and the model could still be told to wound her. Now
 *  departure is a presence drop and nothing else, and this is where the retained person lives — readable,
 *  editable through the same card the stage uses, and DISMISSABLE (`rpg.dismissActor`, the gesture the plane's
 *  additive merge policy always named and never had).
 *
 *  Collapsed by default: it is a memory, not the scene. The count rides the summary so a host knows there is
 *  something behind it without opening it. */
function SceneKnownCharacters({ offstage, edit }: { readonly offstage: readonly RpgActorView[]; readonly edit?: SceneCastEdit }): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (offstage.length === 0) {
    return null;
  }
  return (
    <Stack gap="field" data-slot="rpg-known-characters">
      <Row gap="field" align="center" justify="between">
        <Kicker>Known characters — {offstage.length}</Kicker>
        <Button
          intent="ghost"
          size="sm"
          aria-expanded={open}
          aria-label={open ? "Hide known characters" : "Show known characters"}
          title={open ? "Hide the characters who are not in this scene" : "Characters the story has met who are not in this scene"}
          onClick={(): void => setOpen(!open)}
        >
          <Icon icon={open ? ChevronDown : ChevronRight} size="xs" />
          {open ? "Hide" : "Show"}
        </Button>
      </Row>
      {open ? (
        <Stack gap="field">
          {offstage.map((actor) => (
            <Stack key={actorKey(actor)} gap="field">
              <SceneCastCard actor={actor} {...(edit === undefined ? {} : { edit })} />
              {edit === undefined ? null : <DismissRow actor={actor} onDismiss={edit.onDismiss} />}
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

/** The per-actor DISMISS affordance — two-step by design. Dismissal is the one gesture in this panel that
 *  destroys durable state (the row, its presence, and its locks), and it is reachable next to ordinary edits,
 *  so it asks first. The confirm state names the actor, because a list of cards makes "are you sure?" ambiguous. */
function DismissRow({ actor, onDismiss }: { readonly actor: RpgActorView; readonly onDismiss: (targetRef: RpgActorRef) => void }): ReactElement {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Row gap="field" align="center" justify="end">
        <Button intent="ghost" size="sm" onClick={(): void => setConfirming(true)} title={`Forget ${actor.name} — removes their state from this game`}>
          <Icon icon={X} size="xs" />
          Dismiss
        </Button>
      </Row>
    );
  }
  return (
    <Row gap="field" align="center" justify="end">
      <Text as="span" voice="gloss">
        Forget {actor.name} and everything tracked on them?
      </Text>
      <Button intent="ghost" size="sm" onClick={(): void => setConfirming(false)}>
        Keep
      </Button>
      <Button intent="destructive" size="sm" onClick={(): void => onDismiss(actor.actorRef)}>
        Dismiss
      </Button>
    </Row>
  );
}

/** The Goals echo (#39 dual-homing): read-only rows that NAVIGATE to the quest plane's ONE edit home
 *  (the Quests tab) on click — never a second editor, never a dead echo. The row is a real button
 *  (keyboard-reachable, named "Open <quest> in Quests"); the GoalLine text stays the visible datum. */
function SceneGoals({ quests }: { readonly quests: RpgTrackerView["quests"] }): ReactElement | null {
  if (quests.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      <Kicker>Goals</Kicker>
      {quests.map((quest) => {
        const total = quest.objectives.length;
        const filled = quest.objectives.filter((o) => o.completed).length;
        return (
          <Button
            key={quest.id}
            type="button"
            intent="ghost"
            size="inline"
            aria-label={`Open ${quest.name} in Quests`}
            title="Open in Quests"
            onClick={(): void => revealContextPanel("rpg.quests")}
            className="w-full border border-transparent px-field text-left"
          >
            <GoalLine text={quest.name} done={quest.status === "completed"} {...(total > 0 ? { clock: { filled, total } } : {})} />
          </Button>
        );
      })}
    </Stack>
  );
}

function SceneGameTrackers({
  trackers,
  onEditGameTracker,
  lockPin,
}: {
  readonly trackers: RpgTrackerView["gameTrackers"];
  readonly onEditGameTracker?: (entry: RpgTrackerEntry, next: number) => void;
  /** The section-scoped `trackerValues` hand-lock pin (§12.3) — ONE lock covers every game-tracker value,
   *  so the pin renders once beside the section label. `null` when unlocked/not-host. */
  readonly lockPin?: ReactNode;
}): ReactElement | null {
  if (trackers.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      <Kicker trailing={lockPin}>Trackers</Kicker>
      {trackers.map((entry, i) => (
        <MeterRow
          key={entry.def.key}
          label={entry.def.label}
          // Unset stays unset (side-eye 08-01) — the em-dash arm, never a synthesized `0/0`.
          value={trackerNumber(entry.value ?? undefined)}
          max={trackerCeiling(entry.def, entry.value ?? undefined)}
          // The tracker SHAPE glyph leads the row (the §12.5.5 closed-vocab Record — aria-hidden decoration;
          // the label stays the datum).
          leading={<Icon icon={TRACKER_SHAPE_GLYPHS[entry.def.shape]} size="xs" className="shrink-0 text-muted-foreground" />}
          // The def's host-picked color, warded by the strict hex/OKLCH grammar; else the ordinal ramp.
          {...trackColorProps(resolveTrackerColor(entry.def.color, i))}
          {...(entry.def.hint === "" ? {} : { note: entry.def.hint })}
          {...(onEditGameTracker === undefined ? {} : { onEditValue: (next: number): void => onEditGameTracker(entry, next) })}
        />
      ))}
    </Stack>
  );
}

function SceneBeats({ beats }: { readonly beats: readonly string[] }): ReactElement | null {
  if (beats.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      <Kicker>Just now</Kicker>
      {beats.map((beat, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: recentBeats is a positional, id-less READ-ONLY log (a plain string[]) — beats can repeat verbatim, so content is not unique; immutable within one render, the index IS the beat identity (the character-greeting-preview positional-alternate precedent).
        <BeatLine key={i}>{beat}</BeatLine>
      ))}
    </Stack>
  );
}
