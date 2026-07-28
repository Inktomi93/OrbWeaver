// The SCENE tab (panel-redesign DESIGN.md §4 "Scene" — the NOW window): AmbientStrip → present-cast
// CastCards → GOALS (a PROJECTION of the quest plane — active-only compact echo of the SAME `quests` rows
// the Quests tab homes, §12.1.8; one datum, two lenses) → subjectName-grouped custom widgets (accent rides
// the §12.1.2 ward: a stored `widget.accent` must pass the strict hex/OKLCH grammar, else it heals to the
// ordinal ramp) → the P5 CHOICE-echo shell (wired-when-ready — no choice plane exists; renders nothing
// until CYOA lands) → last-3 BeatLines ("Just now"). Scene = window; Journal = archive.
//
// EDIT-in-place (§3.2), all host-only in v1 (`canEditShared`, which also folds the read-only pill's honest
// arm): ambient fields + widget values ride `editSnapshot` (whole-array/record overlay under [merge-clear]);
// goals ride `upsertQuest`. Beats are a log (read-only by nature).

import type { RpgClockTime, RpgSnapshotState, RpgTrackerView, RpgWidgetView } from "@orb/contracts/rpg";
import { TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { AmbientStrip, BeatLine, CastCard, GoalLine, MeterRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { revealContextPanel } from "#state";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, useResyncFromStory } from "../hooks/use-rpg-mutations";
import { RELATIONSHIP_GLYPHS, WIDGET_TYPE_GLYPHS } from "../lib/glyphs";
import { resolveAccentColor, trackColor, trackColorProps } from "../lib/track-color";
import { RpgChoiceEcho } from "./rpg-choice-echo";
import { RpgDoorwayLine } from "./rpg-doorway-line";
import { RpgFieldLock } from "./rpg-field-lock";
import { Kicker } from "./rpg-kicker";
import { RpgSceneCards } from "./rpg-scene-cards";

const RECENT_BEATS = 3;

/** Invert `TIME_OF_DAY_HOURS` to the nearest label for the ambient strip's Time field. */
function timeOfDayLabel(clock: RpgClockTime): string {
  let best = "";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [label, hour] of Object.entries(TIME_OF_DAY_HOURS)) {
    const dist = Math.abs(hour - clock.hour);
    if (dist < bestDist) {
      bestDist = dist;
      best = label;
    }
  }
  return best;
}

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
    return { weather: { type: next } };
  }
  // Honest lookup (no cast): an unknown label reads `undefined` off the record, so the guard is meaningful.
  const hours: Readonly<Record<string, number | undefined>> = TIME_OF_DAY_HOURS;
  const hour = hours[next];
  return hour === undefined ? null : { clock: { day: currentDay, hour, minute: 0 } };
}

/** Group custom widgets by `subjectName` (§4.4 — "subjectName-grouped widgets"). `pool`/`hp`-bound widgets
 *  render ungrouped (their subject is an actor, shown in Status); only `custom` widgets carry a subject. */
function widgetsBySubject(widgets: readonly RpgWidgetView[]): ReadonlyMap<string, readonly RpgWidgetView[]> {
  const groups = new Map<string, RpgWidgetView[]>();
  for (const w of widgets) {
    const subject = w.def.binding.source === "custom" ? (w.def.binding.subjectName ?? "General") : "General";
    const bucket = groups.get(subject) ?? [];
    bucket.push(w);
    groups.set(subject, bucket);
  }
  return groups;
}

export interface RpgSceneTabProps {
  readonly state: RpgPanelState;
}

/** The ambient field → snapshot lock-path map (§12.3) — the domain knowledge that lives in the feature,
 *  not the shared AmbientStrip. A hand edit of `date` locks the `calendarDate` path, `timeOfDay` locks
 *  `clock`; `location`/`weather` are their own paths. */
const AMBIENT_LOCK_PATH: Readonly<Record<"location" | "date" | "timeOfDay" | "weather", string>> = {
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
  readonly onEditWidget?: (label: string, current: RpgWidgetView["value"], next: number) => void;
  /** Release a hand-lock path back to the model (§12.3). Present only for a host (same gate as the edits). */
  readonly onReleaseLock?: (path: string) => void;
}

function useSceneEdits(state: RpgPanelState): SceneEditCallbacks {
  const { tracker, canEditShared, chatId } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });
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
    castEdit: { onEditCast: (patch): void => editSnapshot.mutate({ chatId, patch }) },
    // Widget VALUES ride editSnapshot's `widgetValues` record (keyed by widget label — the value plane's key).
    onEditWidget: (label, current, next): void =>
      editSnapshot.mutate({ chatId, patch: { widgetValues: { [label]: { ...(current ?? {}), value: Math.max(0, next) } } } }),
    // Release-only edit: an empty patch + the lock path to clear (§12.3 — a lock is metadata, not a leaf).
    onReleaseLock: (path): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [path] }),
  };
}

/** The section-scoped hand-lock pin (§12.3): `editSnapshot` stamps TOP-LEVEL patch paths
 *  (`presentCharacters`, `widgetValues`), so one lock ⇒ one pin ⇒ one Release, rendered beside the
 *  section label. `null` unless the path is locked AND the viewer owns the release (host). */
function sectionLockPin(locked: ReadonlySet<string>, path: string, onReleaseLock: ((path: string) => void) | undefined): ReactNode {
  if (onReleaseLock === undefined || !locked.has(path)) {
    return null;
  }
  return <RpgFieldLock onRelease={(): void => onReleaseLock(path)} />;
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
    ...(ambient !== null && ambient.clock !== null ? { timeOfDay: timeOfDayLabel(ambient.clock) } : {}),
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

/** The lite Scene tab — ambient, cast, goals, the live choice echo, widgets, beats. */
export function RpgSceneTab({ state }: RpgSceneTabProps): ReactElement {
  const { tracker } = state;
  const { onEditAmbient, castEdit, onEditWidget, onReleaseLock } = useSceneEdits(state);

  const beats = tracker.recentBeats.slice(-RECENT_BEATS).reverse();
  const groups = widgetsBySubject(tracker.widgets);
  const locked = new Set(tracker.lockedPaths);
  const ambient = tracker.ambient;

  return (
    <Stack gap="section" data-slot="rpg-scene-tab">
      {ambient === null && onEditAmbient === undefined ? null : <AmbientStrip {...ambientStripProps(ambient, locked, onEditAmbient, onReleaseLock)} />}
      <SceneCast
        cast={tracker.cast}
        castFields={tracker.castFields}
        {...(castEdit === undefined ? {} : { edit: castEdit })}
        lockPin={sectionLockPin(locked, "presentCharacters", onReleaseLock)}
      />
      {/* The Goals section is a filtered ECHO of the quest plane (§12.1.8): ACTIVE only, compact rows —
          the Quests tab is the plane's ONE edit home (#39 dual-homing). A goal row NAVIGATES there. */}
      <SceneGoals quests={tracker.quests.filter((q) => q.status === "active")} />
      <RpgChoiceEcho state={state} />
      <SceneWidgets groups={groups} {...(onEditWidget === undefined ? {} : { onEditWidget })} lockPin={sectionLockPin(locked, "widgetValues", onReleaseLock)} />
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

/** Split a cast member's stored `customFields` record against the host-defined field SCHEMAS (§2.8): a `meter`
 *  field becomes a MeterRow (numeric value/max, the value parsed from its stored string); a `text` field becomes
 *  a labelled chip. Only DEFINED fields render (an orphan value from a deleted field-schema is dropped).
 *
 *  `ordinal` is the ONE cast-field color source of truth (§12.1.2 — color is a DERIVATION, never a datum):
 *  the field's index among METER-kind fields in the SCHEMA's definition order — stable per field, identical
 *  across members (a per-member filtered index would color the same field differently on different cards),
 *  and the SAME ordinal the GM console's definition swatch derives from (definition and display one system, §3). */
function castFieldViews(
  customFields: Readonly<Record<string, string>>,
  castFields: RpgTrackerView["castFields"],
): {
  readonly meters: readonly { key: string; label: string; value: number; max: number; ordinal: number }[];
  readonly texts: readonly { name: string; value: string }[];
} {
  const meters: { key: string; label: string; value: number; max: number; ordinal: number }[] = [];
  const texts: { name: string; value: string }[] = [];
  let meterOrdinal = 0;
  for (const field of castFields) {
    const raw = customFields[field.key];
    if (field.kind === "meter") {
      const ordinal = meterOrdinal;
      meterOrdinal += 1;
      if (raw === undefined) {
        continue;
      }
      const value = Number.parseInt(raw, 10);
      meters.push({ key: field.key, label: field.label, value: Number.isNaN(value) ? 0 : value, max: field.max ?? 0, ordinal });
    } else if (raw !== undefined) {
      texts.push({ name: field.label, value: raw });
    }
  }
  return { meters, texts };
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

interface SceneCastEdit {
  readonly onEditCast: (patch: Record<string, unknown>) => void;
}

function SceneCast({
  cast,
  castFields,
  edit,
  lockPin,
}: {
  readonly cast: RpgTrackerView["cast"];
  readonly castFields: RpgTrackerView["castFields"];
  readonly edit?: SceneCastEdit;
  /** The section-scoped `presentCharacters` hand-lock pin (§12.3) — `null` when unlocked/not-host. */
  readonly lockPin?: ReactNode;
}): ReactElement {
  if (cast.length === 0) {
    // The honest empty-cast doorway (§12.1.5): the scene fills from the story; nothing to author by hand here.
    return <RpgDoorwayLine>No one on stage yet — the story brings them in.</RpgDoorwayLine>;
  }
  // Label→key map for cast-field text chips (chips carry the LABEL; customFields keys by field KEY).
  const keyByLabel = new Map(castFields.map((f) => [f.label, f.key]));
  return (
    <Stack gap="field">
      <Kicker trailing={lockPin}>On stage — {cast.length}</Kicker>
      {cast.map((member) => {
        const { meters, texts } = castFieldViews(member.customFields, castFields);
        const editProps =
          edit === undefined
            ? {}
            : {
                onEditMood: (next: string): void => edit.onEditCast(castPatch(cast, member.key, (m) => ({ ...m, mood: next }))),
                onEditRelationshipKind: (next: RpgTrackerView["cast"][number]["relationship"]["kind"]): void =>
                  edit.onEditCast(
                    castPatch(cast, member.key, (m) => ({ ...m, relationship: { kind: next, label: next === "custom" ? m.relationship.label : "" } })),
                  ),
                onEditField: (label: string, next: string): void => {
                  const fieldKey = keyByLabel.get(label);
                  if (fieldKey !== undefined) {
                    edit.onEditCast(castPatch(cast, member.key, (m) => ({ ...m, customFields: { ...m.customFields, [fieldKey]: next } })));
                  }
                },
              };
        return (
          <CastCard
            key={member.key}
            name={member.name}
            {...(member.mood === "" ? {} : { mood: member.mood })}
            relationship={member.relationship}
            fields={texts}
            // The relationship KIND glyph (the §12.5.5 closed-vocab Record) leads the edit-mode picker.
            relationshipGlyph={<Icon icon={RELATIONSHIP_GLYPHS[member.relationship.kind]} size="xs" className="shrink-0 text-muted-foreground" />}
            {...editProps}
            {...(meters.length === 0
              ? {}
              : {
                  meters: meters.map((m) => {
                    const fieldKey = keyByLabel.get(m.label);
                    return (
                      <MeterRow
                        key={m.key}
                        label={m.label}
                        value={m.value}
                        max={m.max}
                        // The schema-ordinal derivation (§12.1.2) — the same field wears the same track
                        // color on every card AND on its GM-console definition row.
                        color={trackColor(m.ordinal)}
                        {...(edit === undefined || fieldKey === undefined
                          ? {}
                          : {
                              onEditValue: (next: number): void =>
                                edit.onEditCast(
                                  castPatch(cast, member.key, (mem) => ({
                                    ...mem,
                                    customFields: { ...mem.customFields, [fieldKey]: String(Math.max(0, next)) },
                                  })),
                                ),
                            })}
                      />
                    );
                  }),
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
            size="sm"
            aria-label={`Open ${quest.name} in Quests`}
            title="Open in Quests"
            onClick={(): void => revealContextPanel("rpg.quests")}
            className="!h-auto min-h-0 w-full justify-start border border-transparent !px-field !py-0 text-left font-normal"
          >
            <GoalLine text={quest.name} done={quest.status === "completed"} {...(total > 0 ? { clock: { filled, total } } : {})} />
          </Button>
        );
      })}
    </Stack>
  );
}

function SceneWidgets({
  groups,
  onEditWidget,
  lockPin,
}: {
  readonly groups: ReadonlyMap<string, readonly RpgWidgetView[]>;
  readonly onEditWidget?: (label: string, current: RpgWidgetView["value"], next: number) => void;
  /** The section-scoped `widgetValues` hand-lock pin (§12.3) — ONE lock covers every widget value, so the
   *  pin renders once, beside the FIRST group's label. `null` when unlocked/not-host. */
  readonly lockPin?: ReactNode;
}): ReactElement | null {
  if (groups.size === 0) {
    return null;
  }
  return (
    <>
      {[...groups.entries()].map(([subject, subjectWidgets], groupIndex) => (
        <Stack key={subject} gap="field">
          <Kicker trailing={groupIndex === 0 ? lockPin : null}>{subject}</Kicker>
          {subjectWidgets.map((widget, i) => (
            <MeterRow
              key={widget.def.label}
              label={widget.def.label}
              value={widget.value?.value ?? 0}
              max={widget.value?.max ?? 0}
              // The widget's TYPE glyph leads the row (the §12.5.5 closed-vocab Record — aria-hidden
              // decoration; the label stays the datum).
              leading={<Icon icon={WIDGET_TYPE_GLYPHS[widget.def.type]} size="xs" className="shrink-0 text-muted-foreground" />}
              // The accent WARD (§12.1.2): a stored accent renders only when it passes the strict
              // hex/OKLCH grammar; anything else heals to the ordinal ramp.
              {...trackColorProps(resolveAccentColor(widget.def.accent, i))}
              {...(onEditWidget === undefined ? {} : { onEditValue: (next: number): void => onEditWidget(widget.def.label, widget.value, next) })}
            />
          ))}
        </Stack>
      ))}
    </>
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
