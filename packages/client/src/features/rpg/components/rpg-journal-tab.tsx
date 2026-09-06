// The JOURNAL tab ("Journal" — live in lite AND full, the owner correction):
// the campaign CHRONICLE. Scope row (the ONE mini-tab scope-selector semantics): `All | Marks |
// Cards` — Cards is the P4 immersive-card archive (APPLICABILITY: only when the game's `immersiveHtml` is
// on); Wraps stays full-only/unbuilt (no `wrap` member in `RPG_JOURNAL_TYPES` — the scope row grows by
// append). Entries group by REAL date (`timeLib.formatDate`) — the designed in-world day grouping needs
// the flagged `rpg_journal.world_day` column; until it lands the honest arm is real-date
// headers, never a client-invented "Day 3".
//
// Plain beats render as BULLET LINES (`BeatLine` — bordered cards are reserved for
// ARTIFACTS), and immersive cards ARCHIVE INTO THE DAY THEY WERE BORN ("Journal": the shared
// `collectArchivedCards` projection over the same `chat.listMessages` cache the Scene birth-home reads).
//
// MARKS (checkpoints' designed home): a mark row = label · created date · the host-only Restore
// (clone-forward `restoreCheckpoint`, behind a ConfirmDialog naming the consequence) + the host "New mark"
// primary. Members see the list (the verb is member-read), no restore — PERMISSION-omit, never a disabled
// control.
//
// The BEAT ROW itself (its label vocabulary, the host's inline title + EXPAND-IN-PLACE body editor, the
// confirmed delete) lives in `./rpg-beat-row.tsx` — this file owns the scopes, the day grouping and the
// composers. The edit verb reaches MODEL entries too, so the row affordances gate on HOST alone — never on
// who wrote the entry. Members see the chronicle read-only (PERMISSION-omit, never a disabled control).
//
// HAND AUTHORING (RV-6 — the three `*JournalEntry` verbs are host-gated, `resolveHost`): a host gets the
// "New entry" composer at the head of the chronicle (type + title — a CREATION draft, so plain Input/Select,
// not the display-at-rest grammar; the BODY is written in place on the born row). Immersive CARD rows carry
// no affordances: they are projected from the transcript, not `rpg_journal` rows — there is nothing for
// these verbs to address.

import type { RpgJournalType } from "@orb/contracts/rpg";
import { RPG_JOURNAL_TYPES } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Pin } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { AddRow, ConfirmDialog } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { timeLib } from "#lib";
import type { RpgPanelState } from "../hooks/use-rpg-context-state.ts";
import { useAddJournalEntry, useCreateCheckpoint, useDeleteJournalEntry, useEditJournalEntry, useRestoreCheckpoint } from "../hooks/use-rpg-mutations.ts";
import type { ArchivedCard } from "../lib/archived-cards.ts";
import { collectArchivedCards } from "../lib/archived-cards.ts";
import { JOURNAL_TYPE_LABELS } from "../lib/journal-labels.ts";
import type { BeatEdit } from "./rpg-beat-row.tsx";
import { BeatRow } from "./rpg-beat-row.tsx";
import { RpgCardRow } from "./rpg-card-row.tsx";
import { Kicker } from "./rpg-kicker.tsx";
import { RpgCardLightbox } from "./rpg-scene-cards.tsx";

/** The chronicle page size — one fetch (the archive tab is a reading surface, not an infinite feed). */
const JOURNAL_PAGE = 100;

/** Placeholder rows while the transcript the card projection reads lands. */
const JOURNAL_CARDS_PENDING_ROWS = 2;

/** The card projection's three SETTLED arms. A local shape, not an exported type: it exists so the scope
 *  dispatch below can carry "the transcript failed" as a value rather than as an empty array — the #1500
 *  defect was exactly that a failure and an empty archive were the same argument. */
type CardArchive =
  | { readonly status: "ready"; readonly cards: readonly ArchivedCard[] }
  | { readonly status: "pending" }
  | { readonly status: "failed"; readonly retry: () => void };

// The scope axis as the ONE homed tuple (§5.5 dispatch discipline) — the body Record derives from it.
const JOURNAL_SCOPES = ["all", "marks", "cards"] as const;
type JournalScope = (typeof JOURNAL_SCOPES)[number];

function isJournalScope(value: string | undefined): value is JournalScope {
  return (JOURNAL_SCOPES as readonly (string | undefined)[]).includes(value);
}

const JOURNAL_TYPE_ITEMS: SelectItems<string> = RPG_JOURNAL_TYPES.map((value) => ({ value, label: JOURNAL_TYPE_LABELS[value] }));
const DEFAULT_JOURNAL_TYPE: RpgJournalType = "note";

/** One chronicle ROW — a plain beat (bullet line) or an archived immersive card (artifact chrome), merged
 *  into one per-day stream by `createdAt`. */
type ChronicleRow =
  | { readonly kind: "beat"; readonly key: string; readonly type: string; readonly label: string; readonly title: string; readonly content: string }
  | { readonly kind: "card"; readonly card: ArchivedCard };

/** The host "New entry" composer (no dead ends): TYPE + TITLE, fired as one `addJournalEntry`
 *  with an empty body. The BODY is not a third composer field on purpose — the panel is an instrument, not a
 *  form: the born row's content is click-to-edit in place the instant it lands ("write the beat…"),
 *  which is the same authoring gesture every other datum here uses AND keeps this composer in the tab's
 *  one-draft-field grammar (the New-mark / New-quest siblings). A CREATION draft, so plain controls, exempt
 *  from display-at-rest. Tier-2 refusal: a blank title never sends (the wire requires min(1)). */
function NewJournalEntry({ onCreate }: { readonly onCreate: (entry: { type: RpgJournalType; title: string }) => void }): ReactElement {
  const [type, setType] = useState<RpgJournalType>(DEFAULT_JOURNAL_TYPE);
  return (
    <AddRow
      ariaLabel="New entry title"
      placeholder="Title this beat…"
      leading={
        <Select
          aria-label="Entry type"
          items={JOURNAL_TYPE_ITEMS}
          value={type}
          onValueChange={(next): void => setType(next as RpgJournalType)}
          // No height here: Select's default `layout="field"` arm already IS `h-control-sm` (#169 — the
          // duplicate was invisible to `ui-size-via-variant` while its value class rejected hyphens).
          className="basis-1/3"
        />
      }
      actions={[{ key: "entry", label: "Add entry", onAdd: (title: string): void => onCreate({ type, title }) }]}
    />
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
          // Tier-2 refusal: the wire requires min(1) — a blanked title is never sent.
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
    // No dead end: the empty chronicle still offers the host the first page.
    return (
      <Stack gap="section">
        <Text>
          Nothing chronicled yet — {state.isHost ? "the story writes it, or you can start the first page below." : "the story writes the first page."}
        </Text>
        {composer}
      </Stack>
    );
  }

  // Merge beats + cards into one dated stream, newest first, then bucket by REAL date (the honest arm).
  const rows: readonly { readonly createdAt: number; readonly row: ChronicleRow }[] = [
    ...entries.map((entry) => ({
      createdAt: entry.createdAt,
      row: { kind: "beat", key: entry.id, type: entry.type, label: entry.label, title: entry.title, content: entry.content } as const,
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
              <BeatRow key={row.key} beat={row} {...(edit === undefined ? {} : { edit })} />
            ),
          )}
        </Stack>
      ))}
      <RpgCardLightbox cards={cards} openKey={openKey} onOpenChange={setOpenKey} chatId={state.chatId} />
    </Stack>
  );
}

/** The Cards scope — every archived card, newest first (the "find the wanted poster later" surface). */
function JournalCards({ archive, chatId }: { readonly archive: CardArchive; readonly chatId: ChatId }): ReactElement {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The three arms of a projection over two reads (#1500) — the Scene birth-home's own ruling, applied to
  // the archive lens: a transcript that has not landed, or one that failed, is not a story with no cards.
  if (archive.status === "failed") {
    return <QueryErrorState label="the card archive" onRetry={archive.retry} />;
  }
  if (archive.status === "pending") {
    return <SkeletonRows count={JOURNAL_CARDS_PENDING_ROWS} shape="line" />;
  }
  const cards = archive.cards;
  if (cards.length === 0) {
    return <Text>No cards yet — the story crafts them.</Text>;
  }
  const newestFirst = cards.toSorted((a, b) => b.createdAt - a.createdAt);
  return (
    <Stack gap="field">
      {newestFirst.map((card) => (
        <RpgCardRow key={card.key} card={card} onOpen={setOpenKey} />
      ))}
      <RpgCardLightbox cards={cards} openKey={openKey} onOpenChange={setOpenKey} chatId={chatId} />
    </Stack>
  );
}

function JournalMarks({ state }: { readonly state: RpgPanelState }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: marks } = useSuspenseQuery(trpc.rpg.listCheckpoints.queryOptions({ chatId: state.chatId }));
  const createCheckpoint = useCreateCheckpoint({ trpc, invalidation });
  const restoreCheckpoint = useRestoreCheckpoint({ trpc, invalidation });

  const sorted = marks.toSorted((a, b) => b.createdAt - a.createdAt);

  return (
    <Stack gap="section">
      {state.isHost ? (
        <AddRow
          ariaLabel="New mark label"
          placeholder="Mark this moment…"
          pending={createCheckpoint.isPending}
          actions={[{ key: "mark", label: "New mark", onAdd: (label: string): void => createCheckpoint.mutate({ chatId: state.chatId, label }) }]}
        />
      ) : null}

      {sorted.length === 0 ? (
        <Text>No marks yet{state.isHost ? " — mark a moment to bookmark this point in the story." : "."}</Text>
      ) : (
        <Stack gap="field">
          {sorted.map((mark) => (
            <Row key={mark.id} gap="block" align="center" className="rounded-base border border-border bg-card px-block py-row" data-slot="rpg-mark-row">
              <Icon icon={Pin} size="xs" className="text-muted-foreground" />
              <Stack gap="field" className="min-w-0 flex-1">
                <Text as="span" voice="label" className="truncate">
                  {mark.label}
                </Text>
                <Text as="span" voice="gloss">
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
const SCOPE_BODY: Readonly<Record<JournalScope, (state: RpgPanelState, archive: CardArchive) => ReactElement>> = {
  // The chronicle's own day groups still take the cards it HAS: an unread transcript costs the entries scope
  // nothing (its own read is a separate suspending one), so an unknown archive contributes no card rows there
  // rather than blanking the chronicle.
  all: (state, archive) => <JournalEntries state={state} cards={archive.status === "ready" ? archive.cards : []} />,
  marks: (state) => <JournalMarks state={state} />,
  cards: (state, archive) => <JournalCards archive={archive} chatId={state.chatId} />,
};

/** The Journal tab — the chronicle (All) + the checkpoint bookmarks (Marks) + the card archive (Cards). */
export function RpgJournalTab({ state }: RpgJournalTabProps): ReactElement {
  const [scope, setScope] = useState<JournalScope>("all");
  const trpc = useTRPC();
  // The P4 card projection — the SAME `chat.listMessages` cache the transcript + Scene birth-home share
  // (lockdown §12 direct read). APPLICABILITY: only fetched/offered when the game crafts cards at all.
  const cardsEnabled = state.game.publicConfig.immersiveHtml;
  const messagesQuery = useQuery({ ...trpc.chat.listMessages.queryOptions({ chatId: state.chatId }), enabled: cardsEnabled });
  // The participants the per-card render policy resolves against (cache-first — the takeover already read it);
  // a card renders under its ORIGIN ROW's verdict here exactly as it does in the transcript.
  const chatQuery = useQuery({ ...trpc.chat.getChat.queryOptions({ chatId: state.chatId }), enabled: cardsEnabled });
  // Three arms, derived in this order on purpose: a FAILURE outranks an in-flight sibling (a retry is the
  // only move either way), the READY arm is gated on both reads' own `isSuccess` so the projection is built
  // from data TypeScript knows is there, and everything else is still in flight. A game that crafts no cards
  // at all never fetches, so its archive is settled-empty rather than forever-pending.
  let archive: CardArchive;
  if (!cardsEnabled) {
    archive = { status: "ready", cards: [] };
  } else if (messagesQuery.isError || chatQuery.isError) {
    archive = { status: "failed", retry: (): void => void Promise.all([messagesQuery.refetch(), chatQuery.refetch()]) };
  } else if (messagesQuery.isSuccess && chatQuery.isSuccess) {
    archive = {
      status: "ready",
      cards: collectArchivedCards(messagesQuery.data.messages, {
        participants: chatQuery.data.participants,
        viewerUserId: state.viewerUserId,
      }),
    };
  } else {
    archive = { status: "pending" };
  }
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
      {SCOPE_BODY[effectiveScope](state, archive)}
    </Stack>
  );
}
