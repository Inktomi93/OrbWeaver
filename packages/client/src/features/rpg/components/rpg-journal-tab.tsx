// The JOURNAL tab (panel-redesign DESIGN.md §4 "Journal" — live in lite AND full, the owner correction):
// the campaign CHRONICLE. Scope row (the ONE mini-tab scope-selector semantics, §12.1.3): `All | Marks |
// Cards` — Cards is the P4 immersive-card archive (APPLICABILITY: only when the game's `immersiveHtml` is
// on); Wraps stays full-only/unbuilt (no `wrap` member in `RPG_JOURNAL_TYPES` — the scope row grows by
// append). Entries group by REAL date (`timeLib.formatDate`) — the designed in-world day grouping needs
// the flagged `rpg_journal.world_day` column (§12.2.5); until it lands the honest arm is real-date
// headers, never a client-invented "Day 3".
//
// Plain beats render as BULLET LINES (`BeatLine` — the §3 rule: bordered cards are reserved for
// ARTIFACTS), and immersive cards ARCHIVE INTO THE DAY THEY WERE BORN (§4 "Journal": the shared
// `collectArchivedCards` projection over the same `chat.listMessages` cache the Scene birth-home reads).
//
// MARKS (§12.2.4 — checkpoints' designed home): a mark row = label · created date · the host-only Restore
// (clone-forward `restoreCheckpoint`, behind a ConfirmDialog naming the consequence) + the host "New mark"
// primary. Members see the list (the verb is member-read), no restore — PERMISSION-omit, never a disabled
// control.
//
// HAND AUTHORING (RV-6 — the three `*JournalEntry` verbs are host-gated, `resolveHost`): a host gets the
// "New entry" composer at the head of the chronicle (type + title — a CREATION draft, so plain Input/Select,
// not the display-at-rest grammar; the BODY is written in place on the born row) and, on every BEAT row,
// click-to-edit title/content plus a confirmed delete. The edit verb reaches MODEL entries too, so the row
// affordances gate on HOST alone — never on who wrote the entry. Members see the chronicle read-only
// (PERMISSION-omit, never a disabled control). Immersive CARD rows carry no affordances: they are projected
// from the transcript, not `rpg_journal` rows — there is nothing for these verbs to address.

import type { RpgJournalType } from "@orb/contracts/rpg";
import { RPG_JOURNAL_TYPES } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Icon, Pin, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { BeatLine, ConfirmDialog, TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { timeLib } from "#lib";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useAddJournalEntry, useCreateCheckpoint, useDeleteJournalEntry, useEditJournalEntry, useRestoreCheckpoint } from "../hooks/use-rpg-mutations";
import type { ArchivedCard } from "../lib/archived-cards";
import { collectArchivedCards } from "../lib/archived-cards";
import { RpgCardRow } from "./rpg-card-row";
import { Kicker } from "./rpg-kicker";
import { RpgCardLightbox } from "./rpg-scene-cards";

/** The chronicle page size — one fetch (the archive tab is a reading surface, not an infinite feed). */
const JOURNAL_PAGE = 100;

// The scope axis as the ONE homed tuple (§5.5 dispatch discipline) — the body Record derives from it.
const JOURNAL_SCOPES = ["all", "marks", "cards"] as const;
type JournalScope = (typeof JOURNAL_SCOPES)[number];

function isJournalScope(value: string | undefined): value is JournalScope {
  return (JOURNAL_SCOPES as readonly (string | undefined)[]).includes(value);
}

// The journal-TYPE vocabulary — an exhaustive Record over the contracts tuple (§5.5: a new member fails tsc
// here, never renders as a raw slug). The composer's Select derives from it; the row label reads through the
// widened lookup because the VIEW carries `type` as a free string (an older/renamed slug degrades to itself).
const JOURNAL_TYPE_LABELS: Readonly<Record<RpgJournalType, string>> = {
  location: "Location",
  npc: "Character",
  combat: "Combat",
  quest: "Quest",
  item: "Item",
  event: "Event",
  note: "Note",
};
const JOURNAL_TYPE_ITEMS: SelectItems<string> = RPG_JOURNAL_TYPES.map((value) => ({ value, label: JOURNAL_TYPE_LABELS[value] }));
const DEFAULT_JOURNAL_TYPE: RpgJournalType = "note";

/** The display label for a stored entry type — unknown/legacy slugs read as themselves, never blank. */
function journalTypeLabel(type: string): string {
  const labels: Readonly<Record<string, string | undefined>> = JOURNAL_TYPE_LABELS;
  return labels[type] ?? type;
}

/** The host's per-beat write callbacks (absent ⇒ the read-only member arm — PERMISSION-omit). */
interface BeatEdit {
  readonly onEditTitle: (entryId: string, next: string) => void;
  readonly onEditContent: (entryId: string, next: string) => void;
  readonly onDelete: (entryId: string) => void;
}

/** One chronicle ROW — a plain beat (bullet line) or an archived immersive card (artifact chrome), merged
 *  into one per-day stream by `createdAt`. */
type ChronicleRow =
  | { readonly kind: "beat"; readonly key: string; readonly type: string; readonly title: string; readonly content: string }
  | { readonly kind: "card"; readonly card: ArchivedCard };

/** One plain BEAT — a bullet line (§3: cards are reserved for artifacts): the type label, the title, then the
 *  body in the same muted voice. The em-dash marker is BeatLine's own. For a host the title/content are
 *  click-to-edit in place (§12.4.1) and a confirmed delete trails the line; a member reads static text. */
function BeatRow({ row, edit }: { readonly row: Extract<ChronicleRow, { readonly kind: "beat" }>; readonly edit?: BeatEdit }): ReactElement {
  const typeLabel = (
    <Text as="span" size="micro" tone="muted" className="shrink-0 uppercase">
      {journalTypeLabel(row.type)}
    </Text>
  );
  if (edit === undefined) {
    return (
      <BeatLine>
        {typeLabel}{" "}
        <Text as="span" size="label" weight="medium">
          {row.title}
        </Text>
        {row.content === "" ? null : (
          <Text as="span" size="label" tone="muted">
            {` — ${row.content}`}
          </Text>
        )}
      </BeatLine>
    );
  }
  return (
    <BeatLine>
      {typeLabel}
      <TrackerValue ariaLabel={`${row.title} title`} display={row.title} onEdit={(next): void => edit.onEditTitle(row.key, next)} />
      <TrackerValue
        ariaLabel={`${row.title} entry`}
        display={row.content}
        placeholder="write the beat…"
        tone="muted"
        onEdit={(next): void => edit.onEditContent(row.key, next)}
      />
      <ConfirmDialog
        title={`Delete "${row.title}"?`}
        description="The entry leaves the chronicle for good. Nothing else in the game state changes."
        confirmLabel="Delete"
        onConfirm={(): void => edit.onDelete(row.key)}
        trigger={
          <Button intent="ghost" size="sm" className="!size-5 !p-0 shrink-0" title={`Delete entry: ${row.title}`}>
            <Icon icon={Trash2} size="xs" />
          </Button>
        }
      />
    </BeatLine>
  );
}

/** The host "New entry" composer (§12.4 flow — no dead ends): TYPE + TITLE, fired as one `addJournalEntry`
 *  with an empty body. The BODY is not a third composer field on purpose — the panel is an instrument, not a
 *  form (§12.4.1): the born row's content is click-to-edit in place the instant it lands ("write the beat…"),
 *  which is the same authoring gesture every other datum here uses AND keeps this composer in the tab's
 *  one-draft-field grammar (the New-mark / New-quest siblings). A CREATION draft, so plain controls, exempt
 *  from display-at-rest. Tier-2 refusal: a blank title never sends (the wire requires min(1)). */
function NewJournalEntry({ onCreate }: { readonly onCreate: (entry: { type: RpgJournalType; title: string }) => void }): ReactElement {
  const [type, setType] = useState<RpgJournalType>(DEFAULT_JOURNAL_TYPE);
  const [title, setTitle] = useState("");
  const submit = (): void => {
    const trimmed = title.trim();
    if (trimmed !== "") {
      onCreate({ type, title: trimmed });
      setTitle("");
    }
  };
  return (
    <Stack gap="field">
      <Row gap="field" align="center">
        <Select
          aria-label="Entry type"
          items={JOURNAL_TYPE_ITEMS}
          value={type}
          onValueChange={(next): void => setType(next as RpgJournalType)}
          className="h-control-sm basis-1/3"
        />
        <Input aria-label="New entry title" value={title} placeholder="Title this beat…" onValueChange={setTitle} className="h-control-sm flex-1" />
      </Row>
      <Row gap="field" justify="end">
        <Button intent="primary" size="sm" disabled={title.trim() === ""} onClick={submit}>
          Add entry
        </Button>
      </Row>
    </Stack>
  );
}

/** The chronicle (All): the host composer, then plain beats as bullet lines + immersive cards archived into
 *  their birth day, grouped by real date, newest group first. */
function JournalEntries({ state, cards }: { readonly state: RpgPanelState; readonly cards: readonly ArchivedCard[] }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: entries } = useSuspenseQuery(trpc.rpg.listJournal.queryOptions({ chatId: state.chatId, limit: JOURNAL_PAGE }));
  const addEntry = useAddJournalEntry({ trpc, invalidation });
  const editEntry = useEditJournalEntry({ trpc, invalidation });
  const deleteEntry = useDeleteJournalEntry({ trpc, invalidation });
  const [openKey, setOpenKey] = useState<string | null>(null);

  const composer = state.isHost ? <NewJournalEntry onCreate={(entry): void => addEntry.mutate({ chatId: state.chatId, ...entry, content: "" })} /> : null;
  const edit: BeatEdit | undefined = state.isHost
    ? {
        onEditTitle: (entryId, next): void => {
          const trimmed = next.trim();
          // Tier-2 refusal (§12.3): the wire requires min(1) — a blanked title is never sent.
          if (trimmed !== "") {
            editEntry.mutate({ chatId: state.chatId, entryId, patch: { title: trimmed } });
          }
        },
        onEditContent: (entryId, next): void => {
          editEntry.mutate({ chatId: state.chatId, entryId, patch: { content: next.trim() } });
        },
        onDelete: (entryId): void => {
          deleteEntry.mutate({ chatId: state.chatId, entryId });
        },
      }
    : undefined;

  if (entries.length === 0 && cards.length === 0) {
    // No dead end (§4.3 rule 1): the empty chronicle still offers the host the first page.
    return (
      <Stack gap="section">
        <Text tone="muted">
          Nothing chronicled yet — {state.isHost ? "the story writes it, or you can start the first page below." : "the story writes the first page."}
        </Text>
        {composer}
      </Stack>
    );
  }

  // Merge beats + cards into one dated stream, newest first, then bucket by REAL date (§12.2.5 honest arm).
  const rows: readonly { readonly createdAt: number; readonly row: ChronicleRow }[] = [
    ...entries.map((entry) => ({
      createdAt: entry.createdAt,
      row: { kind: "beat", key: entry.id, type: entry.type, title: entry.title, content: entry.content } as const,
    })),
    ...cards.map((card) => ({ createdAt: card.createdAt, row: { kind: "card", card } as const })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  const groups = new Map<string, ChronicleRow[]>();
  for (const { createdAt, row } of rows) {
    const day = timeLib.formatDate(createdAt);
    const bucket = groups.get(day) ?? [];
    bucket.push(row);
    groups.set(day, bucket);
  }

  return (
    <Stack gap="section">
      {composer}
      {[...groups.entries()].map(([day, dayRows]) => (
        <Stack key={day} gap="field">
          <Kicker>{day}</Kicker>
          {dayRows.map((row) =>
            row.kind === "card" ? (
              <RpgCardRow key={row.card.key} card={row.card} onOpen={setOpenKey} />
            ) : (
              <BeatRow key={row.key} row={row} {...(edit === undefined ? {} : { edit })} />
            ),
          )}
        </Stack>
      ))}
      <RpgCardLightbox cards={cards} openKey={openKey} onOpenChange={setOpenKey} />
    </Stack>
  );
}

/** The Cards scope (P4) — every archived card, newest first (the "find the wanted poster later" surface). */
function JournalCards({ cards }: { readonly cards: readonly ArchivedCard[] }): ReactElement {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (cards.length === 0) {
    return <Text tone="muted">No cards yet — the story crafts them.</Text>;
  }
  const newestFirst = [...cards].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Stack gap="field">
      {newestFirst.map((card) => (
        <RpgCardRow key={card.key} card={card} onOpen={setOpenKey} />
      ))}
      <RpgCardLightbox cards={cards} openKey={openKey} onOpenChange={setOpenKey} />
    </Stack>
  );
}

function JournalMarks({ state }: { readonly state: RpgPanelState }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: marks } = useSuspenseQuery(trpc.rpg.listCheckpoints.queryOptions({ chatId: state.chatId }));
  const createCheckpoint = useCreateCheckpoint({ trpc, invalidation });
  const restoreCheckpoint = useRestoreCheckpoint({ trpc, invalidation });
  const [draftLabel, setDraftLabel] = useState("");

  const sorted = [...marks].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <Stack gap="section">
      {state.isHost ? (
        <Row gap="field" align="center">
          {/* A CREATION draft, not a datum at rest — a plain Input, not the display-at-rest grammar. */}
          <Input aria-label="New mark label" value={draftLabel} placeholder="Mark this moment…" onValueChange={setDraftLabel} className="h-control-sm flex-1" />
          <Button
            intent="primary"
            size="sm"
            disabled={draftLabel.trim() === "" || createCheckpoint.isPending}
            onClick={(): void => {
              const label = draftLabel.trim();
              // Tier-2 refusal (§12.3): an empty label never sends (the button is also disabled).
              if (label !== "") {
                createCheckpoint.mutate({ chatId: state.chatId, label });
                setDraftLabel("");
              }
            }}
          >
            New mark
          </Button>
        </Row>
      ) : null}

      {sorted.length === 0 ? (
        <Text tone="muted">No marks yet{state.isHost ? " — mark a moment to bookmark this point in the story." : "."}</Text>
      ) : (
        <Stack gap="field">
          {sorted.map((mark) => (
            <Row key={mark.id} gap="block" align="center" className="rounded-card border border-border bg-card px-block py-row" data-slot="rpg-mark-row">
              <Icon icon={Pin} size="xs" className="text-muted-foreground" />
              <Stack gap="field" className="min-w-0 flex-1">
                <Text as="span" size="label" weight="semibold" className="truncate">
                  {mark.label}
                </Text>
                <Text as="span" size="micro" tone="muted">
                  {timeLib.formatDate(mark.createdAt)}
                </Text>
              </Stack>
              {state.isHost ? (
                <ConfirmDialog
                  title={`Restore "${mark.label}"?`}
                  description="The game state rolls forward from this mark as a new current snapshot. The chronicle keeps everything since."
                  confirmLabel="Restore"
                  confirmIntent="primary"
                  confirmLoading={restoreCheckpoint.isPending}
                  onConfirm={(): void => {
                    restoreCheckpoint.mutate({ chatId: state.chatId, checkpointId: mark.id });
                  }}
                  trigger={
                    <Button intent="ghost" size="sm">
                      Restore
                    </Button>
                  }
                />
              ) : null}
            </Row>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export interface RpgJournalTabProps {
  readonly state: RpgPanelState;
}

/** The scope's body — a Record over the closed scope axis (never a nested ternary). */
const SCOPE_BODY: Readonly<Record<JournalScope, (state: RpgPanelState, cards: readonly ArchivedCard[]) => ReactElement>> = {
  all: (state, cards) => <JournalEntries state={state} cards={cards} />,
  marks: (state) => <JournalMarks state={state} />,
  cards: (_state, cards) => <JournalCards cards={cards} />,
};

/** The Journal tab — the chronicle (All) + the checkpoint bookmarks (Marks) + the card archive (Cards). */
export function RpgJournalTab({ state }: RpgJournalTabProps): ReactElement {
  const [scope, setScope] = useState<JournalScope>("all");
  const trpc = useTRPC();
  // The P4 card projection — the SAME `chat.listMessages` cache the transcript + Scene birth-home share
  // (lockdown §12 direct read). APPLICABILITY: only fetched/offered when the game crafts cards at all.
  const cardsEnabled = state.game.publicConfig.immersiveHtml;
  const messagesQuery = useQuery({ ...trpc.chat.listMessages.queryOptions({ chatId: state.chatId }), enabled: cardsEnabled });
  const cards = cardsEnabled ? collectArchivedCards(messagesQuery.data?.messages ?? []) : [];
  const effectiveScope = scope === "cards" && !cardsEnabled ? "all" : scope;
  return (
    <Stack gap="section" data-slot="rpg-journal-tab">
      <ToggleGroup
        aria-label="Journal scope"
        value={[effectiveScope]}
        onValueChange={(next): void => {
          const picked = next[0];
          if (isJournalScope(picked)) {
            setScope(picked);
          }
        }}
      >
        <Toggle value="all">All</Toggle>
        <Toggle value="marks">Marks</Toggle>
        {/* APPLICABILITY-omit: a game without immersive cards has no Cards scope (never a disabled twin). */}
        {cardsEnabled ? <Toggle value="cards">Cards</Toggle> : null}
      </ToggleGroup>
      {SCOPE_BODY[effectiveScope](state, cards)}
    </Stack>
  );
}
