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

import type { RpgCastGuideField, RpgSnapshotState, RpgTrackerDef, RpgTrackerEntry, RpgTrackerView } from "@orb/contracts/rpg";
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
import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { AmbientStrip, BeatLine, CastCard, GoalLine, MeterRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { revealContextPanel } from "#state";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, usePatchActor, useResyncFromStory } from "../hooks/use-rpg-mutations";
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
  if (!canEditShared) {
    return {};
  }
  return {
    onEditAmbient: (field, next): void => {
      const patch = ambientPatch(field, next, tracker.ambient?.clock?.day ?? 1);
      if (patch !== null) {
        editSnapshot.mutate({ chatId, patch: patch as Record<string, unknown> });
      }
    },
    castEdit: {
      onEditCast: (patch): void => editSnapshot.mutate({ chatId, patch }),
      // A cast member's tracked value writes the SAME per-actor plane a roster member's does, under the
      // member's `cast:<key>` ref (one value home for every actor — the unification's whole point). The
      // written value stays TOTAL because the snapshot merge recurses into it.
      onEditCastTracker: (castKey, def, next): void => {
        patchActor.mutate({
          chatId,
          targetRef: { kind: "cast", castKey },
          ops: [
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
          ],
        });
      },
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

  return (
    <Stack gap="section" data-slot="rpg-scene-tab">
      {ambient === null && onEditAmbient === undefined ? null : <AmbientStrip {...ambientStripProps(ambient, locked, onEditAmbient, onReleaseLock)} />}
      <SceneCast
        cast={tracker.cast}
        castTrackers={tracker.castTrackers}
        {...(castEdit === undefined ? {} : { edit: castEdit })}
        lockPin={sectionLockPin(locked, "presentCharacters", onReleaseLock)}
      />
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

/** The whole-`presentCharacters` overlay for one cast member's one-field change ([merge-clear]: the array
 *  is a full replace, rebuilt from the live cast with the target member patched). Used by every cast edit
 *  (mood, relationship kind, cast-field value) so all cast writes share one patch shape. */
function castPatch(
  cast: RpgTrackerView["cast"],
  key: string,
  mutate: (m: RpgTrackerView["cast"][number]) => RpgTrackerView["cast"][number],
): Record<string, unknown> {
  return { presentCharacters: cast.map((m) => (m.key === key ? mutate(m) : m)) };
}

/** The standing guides this member actually carries (RV-11) — spread onto the card so an UNWRITTEN guide is
 *  simply absent (no line, never a "none" placeholder). The story authors them; the host may correct what is
 *  there, and there is nothing honest to show for one nobody has written. */
function guideProps(member: RpgTrackerView["cast"][number]): Partial<Record<RpgCastGuideField, string>> {
  const out: Partial<Record<RpgCastGuideField, string>> = {};
  for (const field of RPG_CAST_GUIDE_FIELDS) {
    const text = member[field]?.trim() ?? "";
    if (text !== "") {
      out[field] = text;
    }
  }
  return out;
}

interface SceneCastEdit {
  readonly onEditCast: (patch: Record<string, unknown>) => void;
  /** Write ONE tracked value on a cast member (the actorState plane — cast NPCs carry their values on the
   *  SAME per-actor plane roster members use, keyed `cast:<key>`; there is no second cast-value store). The
   *  CURRENT reading is not passed: `patchActor`'s `setTracker` merges onto whatever the true head carries,
   *  so the panel never has to hand back a value it read a beat ago. */
  readonly onEditCastTracker: (castKey: string, def: RpgTrackerDef, next: string | number) => void;
}

function SceneCast({
  cast,
  castTrackers,
  edit,
  lockPin,
}: {
  readonly cast: RpgTrackerView["cast"];
  readonly castTrackers: RpgTrackerView["castTrackers"];
  readonly edit?: SceneCastEdit;
  /** The section-scoped `presentCharacters` hand-lock pin (§12.3) — `null` when unlocked/not-host. */
  readonly lockPin?: ReactNode;
}): ReactElement {
  if (cast.length === 0) {
    // The honest empty-cast doorway (§12.1.5): the scene fills from the story; nothing to author by hand here.
    return <RpgDoorwayLine>No one on stage yet — the story brings them in.</RpgDoorwayLine>;
  }

  return (
    <Stack gap="field">
      <Kicker trailing={lockPin}>On stage — {cast.length}</Kicker>
      {cast.map((member) => {
        // The trackers THIS member carries, resolved server-side through the ONE carrier predicate — so the
        // card shows exactly the set the model's write schema offered for them (never a re-derivation).
        const entries = castTrackers[member.key] ?? [];
        const meters = entries.filter((e) => e.def.shape === "meter");
        const texts = entries
          .filter((e) => e.def.shape !== "meter")
          .map((e) => ({ name: e.def.label, value: trackerReading(e.def, e.value ?? undefined)?.replace(`${e.def.label}: `, "") ?? "" }));
        const editProps =
          edit === undefined
            ? {}
            : {
                onEditMood: (next: string): void => edit.onEditCast(castPatch(cast, member.key, (m) => ({ ...m, mood: next }))),
                // The guides ride the SAME whole-`presentCharacters` overlay mood does — no new verb: they are
                // fields on the same snapshot row, so `editSnapshot` already accepts (and locks) them.
                onEditGuide: (field: RpgCastGuideField, next: string): void =>
                  edit.onEditCast(castPatch(cast, member.key, (m) => ({ ...m, [field]: next.trim() }))),
                onEditRelationshipKind: (next: RpgTrackerView["cast"][number]["relationship"]["kind"]): void =>
                  edit.onEditCast(
                    castPatch(cast, member.key, (m) => ({ ...m, relationship: { kind: next, label: next === "custom" ? m.relationship.label : "" } })),
                  ),
                onEditField: (label: string, next: string): void => {
                  const entry = entries.find((e) => e.def.label === label);
                  if (entry !== undefined) {
                    edit.onEditCastTracker(member.key, entry.def, next);
                  }
                },
              };
        return (
          <CastCard
            key={member.key}
            name={member.name}
            {...(member.emoji === "" ? {} : { emoji: member.emoji })}
            {...(member.mood === "" ? {} : { mood: member.mood })}
            {...guideProps(member)}
            relationship={member.relationship}
            fields={texts}
            // The relationship KIND glyph (the §12.5.5 closed-vocab Record) leads the edit-mode picker.
            relationshipGlyph={<Icon icon={RELATIONSHIP_GLYPHS[member.relationship.kind]} size="xs" className="shrink-0 text-muted-foreground" />}
            {...editProps}
            {...(meters.length === 0
              ? {}
              : {
                  meters: meters.map((m, i) => (
                    <MeterRow
                      key={m.def.key}
                      label={m.def.label}
                      // WHOSE meter — two cast cards on one tab otherwise offer two "Vitality value" buttons.
                      subject={member.name}
                      // NULL stays null (side-eye 08-01): `?? 0` published "0/0" as this NPC's reading.
                      value={trackerNumber(m.value ?? undefined)}
                      // The EFFECTIVE ceiling (this carrier's override, else the def default) — one resolver.
                      max={trackerCeiling(m.def, m.value ?? undefined)}
                      // The def's own color, else the ordinal ramp — the SAME derivation the GM-console
                      // definition row and the band orb use (definition and display one system, §3).
                      {...trackColorProps(resolveTrackerColor(m.def.color, i))}
                      {...(edit === undefined ? {} : { onEditValue: (next: number): void => edit.onEditCastTracker(member.key, m.def, Math.max(0, next)) })}
                    />
                  )),
                })}
          />
        );
      })}
    </Stack>
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
