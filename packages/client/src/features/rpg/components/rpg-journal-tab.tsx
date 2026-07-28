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

import { Button } from "@orb/ui/button";
import { Icon, Pin } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { BeatLine, ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { timeLib } from "#lib";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useCreateCheckpoint, useRestoreCheckpoint } from "../hooks/use-rpg-mutations";
import type { ArchivedCard } from "../lib/archived-cards";
import { cardLabel, collectArchivedCards } from "../lib/archived-cards";
import { RpgCardLightbox } from "./rpg-scene-cards";

/** The chronicle page size — one fetch (the archive tab is a reading surface, not an infinite feed). */
const JOURNAL_PAGE = 100;

// The scope axis as the ONE homed tuple (§5.5 dispatch discipline) — the body Record derives from it.
const JOURNAL_SCOPES = ["all", "marks", "cards"] as const;
type JournalScope = (typeof JOURNAL_SCOPES)[number];

function isJournalScope(value: string | undefined): value is JournalScope {
  return (JOURNAL_SCOPES as readonly (string | undefined)[]).includes(value);
}

// A section label — the muted letter-spaced caps idiom (§4.7).
function SectionLabel({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Text size="label" tone="muted" transform="caps" className="tracking-micro">
      {children}
    </Text>
  );
}

/** One chronicle ROW — a plain beat (bullet line) or an archived immersive card (artifact chrome), merged
 *  into one per-day stream by `createdAt`. */
type ChronicleRow =
  | { readonly kind: "beat"; readonly key: string; readonly title: string; readonly content: string }
  | { readonly kind: "card"; readonly card: ArchivedCard };

/** One archived-card row — the artifact title line (✦ chrome voice); opens the sandboxed card. */
function CardRow({ card, onOpen }: { readonly card: ArchivedCard; readonly onOpen: (key: string) => void }): ReactElement {
  return (
    <Button intent="ghost" size="sm" className="justify-start" onClick={(): void => onOpen(card.key)} data-slot="rpg-journal-card-row">
      <Text size="label" className="truncate">
        ✦ {cardLabel(card.title)}
      </Text>
    </Button>
  );
}

/** The chronicle (All): plain beats as bullet lines + immersive cards archived into their birth day,
 *  grouped by real date, newest group first. */
function JournalEntries({ state, cards }: { readonly state: RpgPanelState; readonly cards: readonly ArchivedCard[] }): ReactElement {
  const trpc = useTRPC();
  const { data: entries } = useSuspenseQuery(trpc.rpg.listJournal.queryOptions({ chatId: state.chatId, limit: JOURNAL_PAGE }));
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (entries.length === 0 && cards.length === 0) {
    return <Text tone="muted">Nothing chronicled yet — the story writes the first page.</Text>;
  }

  // Merge beats + cards into one dated stream, newest first, then bucket by REAL date (§12.2.5 honest arm).
  const rows: readonly { readonly createdAt: number; readonly row: ChronicleRow }[] = [
    ...entries.map((entry) => ({
      createdAt: entry.createdAt,
      row: { kind: "beat", key: entry.id, title: entry.title, content: entry.content } as const,
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
      {[...groups.entries()].map(([day, dayRows]) => (
        <Stack key={day} gap="field">
          <SectionLabel>{day}</SectionLabel>
          {dayRows.map((row) =>
            row.kind === "card" ? (
              <CardRow key={row.card.key} card={row.card} onOpen={setOpenKey} />
            ) : (
              // A plain beat is a BULLET LINE (§3 — cards are reserved for artifacts): title, then the
              // body in the same muted voice. The em-dash marker is BeatLine's own.
              <BeatLine key={row.key}>
                <Text as="span" size="label" weight="medium">
                  {row.title}
                </Text>
                {row.content === "" ? null : (
                  <Text as="span" size="label" tone="muted">
                    {` — ${row.content}`}
                  </Text>
                )}
              </BeatLine>
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
        <CardRow key={card.key} card={card} onOpen={setOpenKey} />
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
