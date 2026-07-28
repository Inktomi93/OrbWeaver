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
//
// P5 — the ACT RAIL (the plot spine, DESIGN §4 "ACT II — THE BONE KEY ●I ─ ◉II ─ ○III"): renders the
// snapshot-resident `tracker.plot` plane (clone-forward like quests — swipe-consistent), current act
// embered (text-highlight), past acts settled, future acts muted. TEXT is the datum (the "ACT II — title"
// line); the dot row is aria-hidden decoration (the tracker-kit a11y model). Null plot ⇒ NOTHING renders
// (no client-invented acts, ever — §12.2.6).

import type { RpgQuestView } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Icon, Plus, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { SegmentedClock } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useEditSnapshot, useUpsertQuest } from "../hooks/use-rpg-mutations";
import { buildPlotEdit } from "../lib/plot-edit";
import { RpgActRail } from "./rpg-act-rail";
import { Kicker } from "./rpg-kicker";

const MIN_CLOCK_SEGMENTS = 2;

interface QuestEdit {
  readonly onEditName: (quest: RpgQuestView, next: string) => void;
  readonly onEditDescription: (quest: RpgQuestView, next: string) => void;
  readonly onToggleObjective: (quest: RpgQuestView, objectiveId: string, next: boolean) => void;
  /** ADD a fresh objective line (#2 — id minted server-side by the upsert). */
  readonly onAddObjective: (quest: RpgQuestView, text: string) => void;
  /** REMOVE an objective line (#2 — whole-objectives-array replace, the authoring wire shape). */
  readonly onRemoveObjective: (quest: RpgQuestView, objectiveId: string) => void;
}

interface QuestCardProps {
  readonly quest: RpgQuestView;
  readonly edit?: QuestEdit;
}

/** The quest DESCRIPTION line — click-to-edit for the host on a live quest (#2); a settled quest reads
 *  struck-through; an empty read-only description renders nothing. */
function QuestDescription({ quest, dim, edit }: { readonly quest: RpgQuestView; readonly dim: boolean; readonly edit?: QuestEdit }): ReactElement | null {
  if (edit !== undefined && !dim) {
    return (
      <TrackerValue
        ariaLabel={`${quest.name} description`}
        display={quest.description}
        placeholder="description…"
        tone="muted"
        size="micro"
        onEdit={(next): void => edit.onEditDescription(quest, next)}
        className="w-full"
      />
    );
  }
  if (quest.description === "") {
    return null;
  }
  return (
    <Text size="micro" tone="muted" className={dim ? "line-through" : undefined}>
      {quest.description}
    </Text>
  );
}

/** The objective checklist: check-off toggles + REMOVE per line + an ADD field (#2 — the wire is the
 *  whole-objectives-array authoring replace). Read-only / settled quests render the plain list. */
function QuestObjectives({ quest, dim, edit }: { readonly quest: RpgQuestView; readonly dim: boolean; readonly edit?: QuestEdit }): ReactElement | null {
  const editable = edit !== undefined && !dim;
  if (quest.objectives.length === 0 && !editable) {
    return null;
  }
  return (
    <Stack gap="field">
      {quest.objectives.map((o) => (
        <Row key={o.id} gap="field" align="center">
          {editable ? (
            <Checkbox
              checked={o.completed}
              onCheckedChange={(next): void => edit.onToggleObjective(quest, o.id, next === true)}
              aria-label={`${o.text} — completed`}
            />
          ) : null}
          <Text as="span" size="label" tone={o.completed ? "muted" : undefined} className={o.completed ? "min-w-0 flex-1 line-through" : "min-w-0 flex-1"}>
            {o.text}
          </Text>
          {editable ? (
            <Button
              intent="ghost"
              size="sm"
              className="!size-5 !p-0 shrink-0"
              onClick={(): void => edit.onRemoveObjective(quest, o.id)}
              title={`Remove objective: ${o.text}`}
            >
              <Icon icon={X} size="xs" />
            </Button>
          ) : null}
        </Row>
      ))}
      {editable ? (
        <TrackerValue
          ariaLabel={`Add objective to ${quest.name}`}
          display=""
          placeholder="+ objective"
          onEdit={(next): void => {
            const trimmed = next.trim();
            if (trimmed !== "") {
              edit.onAddObjective(quest, trimmed);
            }
          }}
          className="w-control-col"
        />
      ) : null}
    </Stack>
  );
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
              <TrackerValue ariaLabel="Quest name" display={quest.name} onEdit={(next): void => edit.onEditName(quest, next)} className="w-full" />
            )}
            {total > 0 ? (
              <Text as="span" size="micro" tone="muted" className="shrink-0 tabular-nums">
                {filled}/{total}
              </Text>
            ) : null}
          </Row>
          <QuestDescription quest={quest} dim={dim} {...(edit === undefined ? {} : { edit })} />
        </Stack>
      </Row>

      <QuestObjectives quest={quest} dim={dim} {...(edit === undefined ? {} : { edit })} />

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

/** The host "New quest" affordance (§12.4 flow — no dead ends): an inline name field + create button that
 *  fires `upsertQuest` with NO `questId` (⇒ create). Tier-2 refusal: an empty name never sends. A CREATION
 *  draft, not a datum at rest — a plain Input, exempt from the display-at-rest grammar (§12.4.1). */
function NewQuest({ onCreate }: { readonly onCreate: (name: string) => void }): ReactElement {
  const [draft, setDraft] = useState("");
  return (
    <Row gap="field" align="center">
      <Input aria-label="New quest name" value={draft} placeholder="Start a quest…" onValueChange={setDraft} className="h-control-sm flex-1" />
      <Button
        intent="primary"
        size="sm"
        disabled={draft.trim() === ""}
        onClick={(): void => {
          const name = draft.trim();
          if (name !== "") {
            onCreate(name);
            setDraft("");
          }
        }}
      >
        <Icon icon={Plus} size="xs" /> New quest
      </Button>
    </Row>
  );
}

/** Build the quest hand-edit callbacks (host) — name/description via a keep-on-omit upsert; objectives as
 *  the whole-array authoring replace (a fresh line rides id-less, the verb mints). */
function buildQuestEdit(chatId: RpgPanelState["chatId"], upsertQuest: ReturnType<typeof useUpsertQuest>): QuestEdit {
  return {
    onEditName: (quest, next): void => {
      const trimmed = next.trim();
      // Tier-2 refusal (§12.3): an empty quest name is never sent — the plane requires min(1).
      if (trimmed !== "") {
        upsertQuest.mutate({ chatId, questId: quest.id, name: trimmed });
      }
    },
    onEditDescription: (quest, next): void => {
      upsertQuest.mutate({ chatId, questId: quest.id, name: quest.name, description: next.trim() });
    },
    onToggleObjective: (quest, objectiveId, next): void => {
      upsertQuest.mutate({
        chatId,
        questId: quest.id,
        name: quest.name,
        objectives: quest.objectives.map((o) => ({ id: o.id, text: o.text, completed: o.id === objectiveId ? next : o.completed })),
      });
    },
    onAddObjective: (quest, text): void => {
      upsertQuest.mutate({
        chatId,
        questId: quest.id,
        name: quest.name,
        objectives: [...quest.objectives.map((o) => ({ id: o.id, text: o.text, completed: o.completed })), { text, completed: false }],
      });
    },
    onRemoveObjective: (quest, objectiveId): void => {
      upsertQuest.mutate({
        chatId,
        questId: quest.id,
        name: quest.name,
        objectives: quest.objectives.filter((o) => o.id !== objectiveId).map((o) => ({ id: o.id, text: o.text, completed: o.completed })),
      });
    },
  };
}

/** The Quests tab — active clock-ring cards + the dimmed done/failed archive + the host New-quest affordance. */
export function RpgQuestsTab({ state }: RpgQuestsTabProps): ReactElement {
  const { tracker, canEditShared, chatId } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const upsertQuest = useUpsertQuest({ trpc, invalidation });
  const editSnapshot = useEditSnapshot({ trpc, invalidation });

  const active = tracker.quests.filter((q) => q.status === "active");
  const settled = tracker.quests.filter((q) => q.status !== "active");

  const onCreate = (name: string): void => upsertQuest.mutate({ chatId, name });

  const plotEdit = canEditShared && tracker.plot !== null ? buildPlotEdit(state, editSnapshot) : undefined;
  const edit = canEditShared ? buildQuestEdit(chatId, upsertQuest) : undefined;
  // P5 — the plot spine (campaign scale) leads the tab; absent until the story authors a plot.
  const rail = tracker.plot === null ? null : <RpgActRail plot={tracker.plot} {...(plotEdit === undefined ? {} : { edit: plotEdit })} />;

  if (tracker.quests.length === 0) {
    // No dead end (§4.3 rule 1): the empty state offers the create affordance to a host, teaches a member.
    return (
      <Stack gap="section" data-slot="rpg-quests-tab">
        {rail}
        <Text tone="muted">No quests yet — {canEditShared ? "start one below." : "the story starts them."}</Text>
        {canEditShared ? <NewQuest onCreate={onCreate} /> : null}
      </Stack>
    );
  }

  return (
    <Stack gap="section" data-slot="rpg-quests-tab">
      {rail}
      <QuestSection heading={`Active — ${active.length}`} quests={active} {...(edit === undefined ? {} : { edit })} />
      <QuestSection heading={`Done — ${settled.length}`} quests={settled} {...(edit === undefined ? {} : { edit })} />
      {canEditShared ? <NewQuest onCreate={onCreate} /> : null}
    </Stack>
  );
}

/** One kicker-led quest-card section (Active / Done) — renders nothing when empty. */
function QuestSection({
  heading,
  quests,
  edit,
}: {
  readonly heading: string;
  readonly quests: readonly RpgQuestView[];
  readonly edit?: QuestEdit;
}): ReactElement | null {
  if (quests.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      <Kicker>{heading}</Kicker>
      {quests.map((quest) => (
        <QuestCard key={quest.id} quest={quest} {...(edit === undefined ? {} : { edit })} />
      ))}
    </Stack>
  );
}
