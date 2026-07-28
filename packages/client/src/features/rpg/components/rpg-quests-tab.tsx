// The QUESTS tab (panel-redesign DESIGN.md §4 "Quests" — live in lite AND full, the owner correction):
// the quest plane's HOME (Scene's Goals is a filtered echo of the SAME rows — §12.1.8, one datum two
// lenses). ACTIVE quests render as clock-ring cards — the `SegmentedClock`'s segments ARE the objectives
// (D58; never a decorative dial; a 0/1-objective quest shows only the `n/m`-less checklist) — with the
// objective checklist beneath; DONE quests dim + strike with a wrap line (no TurnRef — the plane carries
// no completion ref yet, §12.2 "wrapped at t28" change); FAILED quests strike in the destructive tone
// (the §12.2 missing-state addition). The act rail (I·II·III) has NO data plane — demoted to P5, ships
// nothing (§12.2.6; no client-invented acts, ever).
//
// EDIT-in-place (host, `canEditShared`): quest name inline (upsertQuest), objective completion via a
// checkbox (whole-objectives-array replace — the authoring wire shape). Text is the datum everywhere;
// the ring is aria-hidden geometry (role="meter" is SegmentedClock's own contract).

import type { RpgQuestView } from "@orb/contracts/rpg";
import { Checkbox } from "@orb/ui/checkbox";
import { Row, Stack } from "@orb/ui/layout";
import { SegmentedClock } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useUpsertQuest } from "../hooks/use-rpg-mutations";

const MIN_CLOCK_SEGMENTS = 2;

// A section label — the muted letter-spaced caps idiom (§4.7).
function SectionLabel({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Text size="label" tone="muted" transform="caps" className="tracking-micro">
      {children}
    </Text>
  );
}

interface QuestEdit {
  readonly onEditName: (quest: RpgQuestView, next: string) => void;
  readonly onToggleObjective: (quest: RpgQuestView, objectiveId: string, next: boolean) => void;
}

interface QuestCardProps {
  readonly quest: RpgQuestView;
  readonly edit?: QuestEdit;
}

/** One quest card: clock ring (segments = objectives) · name · description · objective checklist. */
function QuestCard({ quest, edit }: QuestCardProps): ReactElement {
  const total = quest.objectives.length;
  const filled = quest.objectives.filter((o) => o.completed).length;
  const done = quest.status === "completed";
  const failed = quest.status === "failed";
  const dim = done || failed;

  return (
    <Stack gap="field" className="rounded-card border border-border bg-card px-block py-row" data-slot="rpg-quest-card">
      <Row gap="block" align="center">
        {total >= MIN_CLOCK_SEGMENTS ? (
          <SegmentedClock
            segments={total}
            filled={filled}
            completed={done}
            size="sm"
            label={`${quest.name} objectives`}
            {...(failed ? { className: "text-destructive" } : {})}
          />
        ) : null}
        <Stack gap="field" className="min-w-0 flex-1">
          <Row gap="block" align="baseline" justify="between">
            {edit === undefined || dim ? (
              <Text as="span" size="label" weight="semibold" className={dim ? "text-muted-foreground line-through" : undefined}>
                {quest.name}
              </Text>
            ) : (
              <TrackerValue ariaLabel="Quest name" display={quest.name} onEdit={(next): void => edit.onEditName(quest, next)} className="h-control-sm w-full" />
            )}
            {total > 0 ? (
              <Text as="span" size="micro" tone="muted" className="shrink-0 tabular-nums">
                {filled}/{total}
              </Text>
            ) : null}
          </Row>
          {quest.description === "" ? null : (
            <Text size="micro" tone="muted" className={dim ? "line-through" : undefined}>
              {quest.description}
            </Text>
          )}
        </Stack>
      </Row>

      {total === 0 ? null : (
        <Stack gap="field">
          {quest.objectives.map((o) => (
            <Row key={o.id} gap="field" align="center">
              {edit === undefined || dim ? null : (
                <Checkbox
                  checked={o.completed}
                  onCheckedChange={(next): void => edit.onToggleObjective(quest, o.id, next === true)}
                  aria-label={`${o.text} — completed`}
                />
              )}
              <Text as="span" size="label" tone={o.completed ? "muted" : undefined} className={o.completed ? "line-through" : undefined}>
                {o.text}
              </Text>
            </Row>
          ))}
        </Stack>
      )}

      {done ? (
        <Text size="micro" tone="muted">
          wrapped — the story closed this one.
        </Text>
      ) : null}
      {failed ? (
        <Text size="micro" className="text-destructive">
          failed — the story closed this one.
        </Text>
      ) : null}
    </Stack>
  );
}

export interface RpgQuestsTabProps {
  readonly state: RpgPanelState;
}

/** The Quests tab — active clock-ring cards + the dimmed done/failed archive. */
export function RpgQuestsTab({ state }: RpgQuestsTabProps): ReactElement {
  const { tracker, canEditShared, chatId } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const upsertQuest = useUpsertQuest({ trpc, invalidation });

  const active = tracker.quests.filter((q) => q.status === "active");
  const settled = tracker.quests.filter((q) => q.status !== "active");

  const edit: QuestEdit | undefined = canEditShared
    ? {
        onEditName: (quest, next): void => {
          const trimmed = next.trim();
          // Tier-2 refusal (§12.3): an empty quest name is never sent — the plane requires min(1).
          if (trimmed !== "") {
            upsertQuest.mutate({ chatId, questId: quest.id, name: trimmed });
          }
        },
        onToggleObjective: (quest, objectiveId, next): void => {
          upsertQuest.mutate({
            chatId,
            questId: quest.id,
            name: quest.name,
            objectives: quest.objectives.map((o) => ({ id: o.id, text: o.text, completed: o.id === objectiveId ? next : o.completed })),
          });
        },
      }
    : undefined;

  if (tracker.quests.length === 0) {
    return <Text tone="muted">No quests yet — the story starts them.</Text>;
  }

  return (
    <Stack gap="section" data-slot="rpg-quests-tab">
      {active.length === 0 ? null : (
        <Stack gap="field">
          <SectionLabel>Active — {active.length}</SectionLabel>
          {active.map((quest) => (
            <QuestCard key={quest.id} quest={quest} {...(edit === undefined ? {} : { edit })} />
          ))}
        </Stack>
      )}
      {settled.length === 0 ? null : (
        <Stack gap="field">
          <SectionLabel>Done — {settled.length}</SectionLabel>
          {settled.map((quest) => (
            <QuestCard key={quest.id} quest={quest} {...(edit === undefined ? {} : { edit })} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
