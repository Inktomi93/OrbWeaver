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
import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { AmbientStrip, BeatLine, CastCard, GoalLine, MeterRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, useUpsertQuest } from "../hooks/use-rpg-mutations";
import { RELATIONSHIP_GLYPHS, WIDGET_TYPE_GLYPHS } from "../lib/glyphs";
import { resolveAccentColor, trackColor, trackColorProps } from "../lib/track-color";
import { RpgDoorwayLine } from "./rpg-doorway-line";
import { RpgFieldLock } from "./rpg-field-lock";
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
 *  gated by `trackersReadOnly`, D108). Splitting them out keeps the tab body under the complexity gate. */
interface SceneEditCallbacks {
  readonly onEditAmbient?: (field: "location" | "date" | "timeOfDay" | "weather", next: string) => void;
  readonly onEditGoal?: (questId: RpgSceneQuest["id"], next: string) => void;
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
  const upsertQuest = useUpsertQuest({ trpc, invalidation });
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
    onEditGoal: (questId, next): void => upsertQuest.mutate({ chatId, questId, name: next }),
    castEdit: { onEditCast: (patch): void => editSnapshot.mutate({ chatId, patch }) },
    // Widget VALUES ride editSnapshot's `widgetValues` record (keyed by widget label — the value plane's key).
    onEditWidget: (label, current, next): void =>
      editSnapshot.mutate({ chatId, patch: { widgetValues: { [label]: { ...(current ?? {}), value: Math.max(0, next) } } } }),
    // Release-only edit: an empty patch + the lock path to clear (§12.3 — a lock is metadata, not a leaf).
    onReleaseLock: (path): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [path] }),
  };
}

/** The lite Scene tab — ambient, cast, goals, widgets, beats. */
export function RpgSceneTab({ state }: RpgSceneTabProps): ReactElement {
  const { tracker } = state;
  const { onEditAmbient, onEditGoal, castEdit, onEditWidget, onReleaseLock } = useSceneEdits(state);

  const beats = tracker.recentBeats.slice(-RECENT_BEATS).reverse();
  const groups = widgetsBySubject(tracker.widgets);
  const locked = new Set(tracker.lockedPaths);

  const ambient = tracker.ambient;
  const ambientProps: Parameters<typeof AmbientStrip>[0] = {
    ...(ambient !== null && ambient.location !== "" ? { location: ambient.location } : {}),
    ...(ambient !== null && ambient.calendarDate !== null ? { date: ambient.calendarDate } : {}),
    ...(ambient !== null && ambient.clock !== null ? { timeOfDay: timeOfDayLabel(ambient.clock) } : {}),
    ...(ambient !== null && ambient.weather !== null ? { weather: ambient.weather.type } : {}),
    ...(onEditAmbient === undefined ? {} : { onEditField: onEditAmbient }),
    // The pin + Release on a hand-locked ambient field (§12.3) — host-only (rides `onReleaseLock`).
    ...(onReleaseLock === undefined
      ? {}
      : {
          lockSlot: (field: "location" | "date" | "timeOfDay" | "weather"): ReactNode => {
            const path = AMBIENT_LOCK_PATH[field];
            return locked.has(path) ? <RpgFieldLock onRelease={(): void => onReleaseLock(path)} /> : null;
          },
        }),
  };

  return (
    <Stack gap="section" data-slot="rpg-scene-tab">
      {ambient === null && onEditAmbient === undefined ? null : <AmbientStrip {...ambientProps} />}
      <SceneCast cast={tracker.cast} castFields={tracker.castFields} {...(castEdit === undefined ? {} : { edit: castEdit })} />
      {/* The Goals section is a filtered ECHO of the quest plane (§12.1.8): ACTIVE only, compact rows —
          the Quests tab is the plane's home. One datum, two lenses, zero divergent state. */}
      <SceneGoals quests={tracker.quests.filter((q) => q.status === "active")} {...(onEditGoal === undefined ? {} : { onEditGoal })} />
      <RpgChoiceEcho choices={[]} />
      <SceneWidgets groups={groups} {...(onEditWidget === undefined ? {} : { onEditWidget })} />
      <SceneBeats beats={beats} />
      <RpgSceneCards chatId={state.chatId} enabled={state.game.publicConfig.immersiveHtml} />
    </Stack>
  );
}

// A section label — the muted letter-spaced caps idiom (§4.7).
function SectionLabel({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Text size="label" tone="muted" transform="caps" className="tracking-micro">
      {children}
    </Text>
  );
}

/** Split a cast member's stored `customFields` record against the host-defined field SCHEMAS (§2.8): a `meter`
 *  field becomes a MeterRow (numeric value/max, the value parsed from its stored string); a `text` field becomes
 *  a labelled chip. Only DEFINED fields render (an orphan value from a deleted field-schema is dropped). */
function castFieldViews(
  customFields: Readonly<Record<string, string>>,
  castFields: RpgTrackerView["castFields"],
): { readonly meters: readonly { key: string; label: string; value: number; max: number }[]; readonly texts: readonly { name: string; value: string }[] } {
  const meters: { key: string; label: string; value: number; max: number }[] = [];
  const texts: { name: string; value: string }[] = [];
  for (const field of castFields) {
    const raw = customFields[field.key];
    if (raw === undefined) {
      continue;
    }
    if (field.kind === "meter") {
      const value = Number.parseInt(raw, 10);
      meters.push({ key: field.key, label: field.label, value: Number.isNaN(value) ? 0 : value, max: field.max ?? 0 });
    } else {
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
}: {
  readonly cast: RpgTrackerView["cast"];
  readonly castFields: RpgTrackerView["castFields"];
  readonly edit?: SceneCastEdit;
}): ReactElement {
  if (cast.length === 0) {
    // The honest empty-cast doorway (§12.1.5): the scene fills from the story; nothing to author by hand here.
    return <RpgDoorwayLine>No one on stage yet — the story brings them in.</RpgDoorwayLine>;
  }
  // Label→key map for cast-field text chips (chips carry the LABEL; customFields keys by field KEY).
  const keyByLabel = new Map(castFields.map((f) => [f.label, f.key]));
  return (
    <Stack gap="field">
      <SectionLabel>On stage — {cast.length}</SectionLabel>
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
                  meters: meters.map((m, i) => {
                    const fieldKey = keyByLabel.get(m.label);
                    return (
                      <MeterRow
                        key={m.key}
                        label={m.label}
                        value={m.value}
                        max={m.max}
                        color={trackColor(i)}
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

type RpgSceneQuest = RpgTrackerView["quests"][number];

function SceneGoals({
  quests,
  onEditGoal,
}: {
  readonly quests: RpgTrackerView["quests"];
  readonly onEditGoal?: (questId: RpgSceneQuest["id"], next: string) => void;
}): ReactElement | null {
  if (quests.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      <SectionLabel>Goals</SectionLabel>
      {quests.map((quest) => {
        const total = quest.objectives.length;
        const filled = quest.objectives.filter((o) => o.completed).length;
        return (
          <GoalLine
            key={quest.id}
            text={quest.name}
            done={quest.status === "completed"}
            {...(total > 0 ? { clock: { filled, total } } : {})}
            {...(onEditGoal === undefined ? {} : { onEditText: (next: string): void => onEditGoal(quest.id, next) })}
          />
        );
      })}
    </Stack>
  );
}

function SceneWidgets({
  groups,
  onEditWidget,
}: {
  readonly groups: ReadonlyMap<string, readonly RpgWidgetView[]>;
  readonly onEditWidget?: (label: string, current: RpgWidgetView["value"], next: number) => void;
}): ReactElement | null {
  if (groups.size === 0) {
    return null;
  }
  return (
    <>
      {[...groups.entries()].map(([subject, subjectWidgets]) => (
        <Stack key={subject} gap="field">
          <SectionLabel>{subject}</SectionLabel>
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

// ─── The P5 CHOICE echo — the wired-when-ready shell (info-blue voice) ───────────────────────────

/**
 * One offered choice — the P5 (CYOA) forward-seam shape the choice plane will supply.
 * @public P5 forward-seam (panel-redesign DESIGN.md §6 P5) — unwired ≠ worthless; the CYOA lane fills it.
 */
export interface RpgSceneChoice {
  readonly id: string;
  readonly text: string;
}

/** The "Choice on the table" block (§6 P5 — moment-scale CYOA; info blue, numbered). Renders NOTHING
 *  until the choice plane exists — the honest empty plane, never filler. LOCAL (rendered in-file with an
 *  empty list today); the P5 lane wires real `choices` (+ the pick verb; the wand owns the send — this
 *  block is the echo). The `RpgSceneChoice` prop type stays exported as the seam's published shape. */
function RpgChoiceEcho({ choices }: { readonly choices: readonly RpgSceneChoice[] }): ReactElement | null {
  if (choices.length === 0) {
    return null;
  }
  return (
    <Stack gap="field" data-slot="rpg-choice-echo" className="rounded-card border border-info bg-card px-block py-row">
      <Text size="label" transform="caps" className="tracking-micro text-info">
        Choice on the table
      </Text>
      {choices.map((choice, i) => (
        <Text key={choice.id} size="label">
          {i + 1}. {choice.text}
        </Text>
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
      <SectionLabel>Just now</SectionLabel>
      {beats.map((beat, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: recentBeats is a positional, id-less READ-ONLY log (a plain string[]) — beats can repeat verbatim, so content is not unique; immutable within one render, the index IS the beat identity (the character-greeting-preview positional-alternate precedent).
        <BeatLine key={i}>{beat}</BeatLine>
      ))}
    </Stack>
  );
}
