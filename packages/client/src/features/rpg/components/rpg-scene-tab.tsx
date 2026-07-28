// The Scene tab (Context-Panel-Program §4.4 — lite's CENTERPIECE): AmbientStrip → present-cast CastCards →
// GoalLines → subjectName-grouped custom widgets → last-3 BeatLines ("Just now"). Scene = NOW; Journal = the
// record (window vs archive — Journal is APPLICABILITY-omitted in lite, §4.4). This is where the CP-3 tracker
// blocks live once the chat is a game.
//
// EDIT-in-place (§3.2), all host-only in v1 (`canEditShared`, which also folds the read-only pill's honest
// arm): ambient fields + widget values ride `editSnapshot` (whole-array/record overlay under [merge-clear]);
// goals ride `upsertQuest`. Beats are a log (read-only by nature).

import type { RpgClockTime, RpgSnapshotState, RpgTrackerView, RpgWidgetView } from "@orb/contracts/rpg";
import { TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { AmbientStrip, BeatLine, CastCard, GoalLine, MeterRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, useUpsertQuest } from "../hooks/use-rpg-mutations";
import { trackColor } from "../lib/track-color";

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

/** The lite Scene tab — ambient, cast, goals, widgets, beats. */
export function RpgSceneTab({ state }: RpgSceneTabProps): ReactElement {
  const { tracker, canEditShared, chatId } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editSnapshot = useEditSnapshot({ trpc, invalidation });
  const upsertQuest = useUpsertQuest({ trpc, invalidation });

  const beats = tracker.recentBeats.slice(-RECENT_BEATS).reverse();
  const groups = widgetsBySubject(tracker.widgets);

  const onEditAmbient = canEditShared
    ? (field: "location" | "date" | "timeOfDay" | "weather", next: string): void => {
        const patch = ambientPatch(field, next, tracker.ambient?.clock?.day ?? 1);
        if (patch !== null) {
          editSnapshot.mutate({ chatId, patch: patch as Record<string, unknown> });
        }
      }
    : undefined;

  const ambient = tracker.ambient;
  const ambientProps: Parameters<typeof AmbientStrip>[0] = {
    ...(ambient !== null && ambient.location !== "" ? { location: ambient.location } : {}),
    ...(ambient !== null && ambient.calendarDate !== null ? { date: ambient.calendarDate } : {}),
    ...(ambient !== null && ambient.clock !== null ? { timeOfDay: timeOfDayLabel(ambient.clock) } : {}),
    ...(ambient !== null && ambient.weather !== null ? { weather: ambient.weather.type } : {}),
    ...(onEditAmbient === undefined ? {} : { onEditField: onEditAmbient }),
  };

  const onEditGoal = canEditShared ? (questId: RpgSceneQuest["id"], next: string): void => upsertQuest.mutate({ chatId, questId, name: next }) : undefined;

  return (
    <Stack gap="section" data-slot="rpg-scene-tab">
      {ambient === null && onEditAmbient === undefined ? null : <AmbientStrip {...ambientProps} />}
      <SceneCast cast={tracker.cast} castFields={tracker.castFields} />
      <SceneGoals quests={tracker.quests} {...(onEditGoal === undefined ? {} : { onEditGoal })} />
      <SceneWidgets groups={groups} />
      <SceneBeats beats={beats} />
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

function SceneCast({ cast, castFields }: { readonly cast: RpgTrackerView["cast"]; readonly castFields: RpgTrackerView["castFields"] }): ReactElement {
  if (cast.length === 0) {
    return <Text tone="muted">No one on stage yet.</Text>;
  }
  return (
    <Stack gap="field">
      <SectionLabel>On stage — {cast.length}</SectionLabel>
      {cast.map((member) => {
        const { meters, texts } = castFieldViews(member.customFields, castFields);
        return (
          <CastCard
            key={member.key}
            name={member.name}
            {...(member.mood === "" ? {} : { mood: member.mood })}
            relationship={member.relationship}
            fields={texts}
            {...(meters.length === 0
              ? {}
              : {
                  meters: meters.map((m, i) => <MeterRow key={m.key} label={m.label} value={m.value} max={m.max} color={trackColor(i)} />),
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

function SceneWidgets({ groups }: { readonly groups: ReadonlyMap<string, readonly RpgWidgetView[]> }): ReactElement | null {
  if (groups.size === 0) {
    return null;
  }
  return (
    <>
      {[...groups.entries()].map(([subject, subjectWidgets]) => (
        <Stack key={subject} gap="field">
          <SectionLabel>{subject}</SectionLabel>
          {subjectWidgets.map((widget, i) => (
            <MeterRow key={widget.def.label} label={widget.def.label} value={widget.value?.value ?? 0} max={widget.value?.max ?? 0} color={trackColor(i)} />
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
      <SectionLabel>Just now</SectionLabel>
      {beats.map((beat, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: recentBeats is a positional, id-less READ-ONLY log (a plain string[]) — beats can repeat verbatim, so content is not unique; immutable within one render, the index IS the beat identity (the character-greeting-preview positional-alternate precedent).
        <BeatLine key={i}>{beat}</BeatLine>
      ))}
    </Stack>
  );
}
