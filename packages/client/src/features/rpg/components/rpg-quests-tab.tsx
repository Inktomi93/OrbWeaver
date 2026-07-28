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

import type { RpgPlot, RpgQuestView } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Icon, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { SegmentedClock } from "@orb/ui/meter";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useUpsertQuest } from "../hooks/use-rpg-mutations";

const MIN_CLOCK_SEGMENTS = 2;

// Roman act labels for the rail (acts beyond the table fall back to the arabic number — a 20-act
// campaign still labels honestly).
const ROMAN_ACTS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

function actNumeral(act: number): string {
  return ROMAN_ACTS[act - 1] ?? String(act);
}

// The rail's per-state glyph + tone (a Record over the closed 3-state axis — never a nested ternary).
const ACT_STATES = ["past", "current", "future"] as const;
type ActState = (typeof ACT_STATES)[number];
const ACT_STATE_STYLE: Readonly<Record<ActState, { readonly glyph: string; readonly className: string }>> = {
  past: { glyph: "●", className: "text-foreground" },
  current: { glyph: "◉", className: "text-highlight font-semibold" },
  future: { glyph: "○", className: "text-muted-foreground" },
};

function actState(act: number, current: number): ActState {
  if (act === current) {
    return "current";
  }
  return act < current ? "past" : "future";
}

/** One act stop on the rail — the connector rule (from act 2 on) + the state-toned glyph + numeral. */
function ActStop({ act, current }: { readonly act: number; readonly current: number }): ReactElement {
  const style = ACT_STATE_STYLE[actState(act, current)];
  return (
    <Row gap="field" align="center" className={act === 1 ? undefined : "flex-1"}>
      {act === 1 ? null : <Separator className="flex-1" />}
      <Text as="span" size="micro" className={style.className}>
        {style.glyph} {actNumeral(act)}
      </Text>
    </Row>
  );
}

/** The P5 act rail — the campaign-scale plot spine above the quest cards. Renders nothing without a plot
 *  plane. The heading TEXT is the datum (`ACT II — THE BONE KEY`); the dot row is aria-hidden geometry. */
function RpgActRail({ plot }: { readonly plot: RpgPlot }): ReactElement {
  const total = Math.max(plot.acts.length, plot.act);
  const acts = Array.from({ length: total }, (_, i) => i + 1);
  const currentTitle = plot.acts[plot.act - 1]?.title ?? "";
  const heading = currentTitle !== "" ? `Act ${actNumeral(plot.act)} — ${currentTitle}` : `Act ${actNumeral(plot.act)}`;
  return (
    <Stack gap="field" data-slot="rpg-act-rail" className="rounded-card border border-border bg-card px-block py-row">
      <Row gap="block" align="baseline" justify="between">
        <Text size="label" weight="semibold" transform="caps" className="tracking-micro text-highlight">
          {heading}
        </Text>
        {plot.title === "" ? null : (
          <Text as="span" size="micro" tone="muted" className="truncate">
            {plot.title}
          </Text>
        )}
      </Row>
      <Row gap="field" align="center" aria-hidden="true">
        {acts.map((act) => (
          <ActStop key={act} act={act} current={plot.act} />
        ))}
      </Row>
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

/** The Quests tab — active clock-ring cards + the dimmed done/failed archive + the host New-quest affordance. */
export function RpgQuestsTab({ state }: RpgQuestsTabProps): ReactElement {
  const { tracker, canEditShared, chatId } = state;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const upsertQuest = useUpsertQuest({ trpc, invalidation });

  const active = tracker.quests.filter((q) => q.status === "active");
  const settled = tracker.quests.filter((q) => q.status !== "active");

  const onCreate = (name: string): void => upsertQuest.mutate({ chatId, name });

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
    // No dead end (§4.3 rule 1): the empty state offers the create affordance to a host, teaches a member.
    return (
      <Stack gap="section" data-slot="rpg-quests-tab">
        {tracker.plot ? <RpgActRail plot={tracker.plot} /> : null}
        <Text tone="muted">No quests yet — {canEditShared ? "start one below." : "the story starts them."}</Text>
        {canEditShared ? <NewQuest onCreate={onCreate} /> : null}
      </Stack>
    );
  }

  return (
    <Stack gap="section" data-slot="rpg-quests-tab">
      {/* P5 — the plot spine (campaign scale) leads the tab; absent until the story authors a plot. */}
      {tracker.plot ? <RpgActRail plot={tracker.plot} /> : null}
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
      {canEditShared ? <NewQuest onCreate={onCreate} /> : null}
    </Stack>
  );
}
