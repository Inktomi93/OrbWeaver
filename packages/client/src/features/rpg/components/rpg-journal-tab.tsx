// The JOURNAL tab (panel-redesign DESIGN.md §4 "Journal" — live in lite AND full, the owner correction):
// the campaign CHRONICLE. Scope row (the ONE mini-tab scope-selector semantics, §12.1.3): `All | Marks` —
// Wraps is full-only and Cards is P4 (APPLICABILITY-omitted until their planes exist; the scope row grows
// by append, wired-when-ready). Entries group by REAL date (`timeLib.formatDate`) — the designed in-world
// day grouping needs the flagged `rpg_journal.world_day` column (§12.2.5); until it lands the honest arm
// is real-date headers, never a client-invented "Day 3".
//
// MARKS (§12.2.4 — checkpoints' designed home): a mark row = label · created date · the host-only Restore
// (clone-forward `restoreCheckpoint`, behind a ConfirmDialog naming the consequence) + the host "New mark"
// primary. Members see the list (the verb is member-read), no restore — PERMISSION-omit, never a disabled
// control. Entry glyphs ride the CLOSED journal-type Record (exhaustive — a new type fails tsc).

import type { RpgJournalType } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon, MapPin, Package, Pin, Scroll, ScrollText, Swords, Users, Zap } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { ConfirmDialog, TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { timeLib } from "#lib";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useCreateCheckpoint, useRestoreCheckpoint } from "../hooks/use-rpg-mutations";

/** The chronicle page size — one fetch (the archive tab is a reading surface, not an infinite feed). */
const JOURNAL_PAGE = 100;

/** Journal-type glyph — exhaustive over the CLOSED `RPG_JOURNAL_TYPES` vocab (§12.5.5). */
const JOURNAL_TYPE_GLYPHS: Readonly<Record<RpgJournalType, LucideIcon>> = {
  location: MapPin,
  npc: Users,
  combat: Swords,
  quest: Scroll,
  item: Package,
  event: Zap,
  note: ScrollText,
};

/** Free-string type → glyph (the wire view carries `type: string`); off-vocab falls back to `note`. */
function journalGlyph(type: string): LucideIcon {
  const map: Readonly<Record<string, LucideIcon | undefined>> = JOURNAL_TYPE_GLYPHS;
  return map[type] ?? ScrollText;
}

type JournalScope = "all" | "marks";

// A section label — the muted letter-spaced caps idiom (§4.7).
function SectionLabel({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Text size="label" tone="muted" transform="caps" className="tracking-micro">
      {children}
    </Text>
  );
}

function JournalEntries({ state }: { readonly state: RpgPanelState }): ReactElement {
  const trpc = useTRPC();
  const { data: entries } = useSuspenseQuery(trpc.rpg.listJournal.queryOptions({ chatId: state.chatId, limit: JOURNAL_PAGE }));

  if (entries.length === 0) {
    return <Text tone="muted">Nothing chronicled yet — the story writes the first page.</Text>;
  }

  // Group by REAL date (the §12.2.5 honest arm until `world_day` lands) — newest group first.
  const groups = new Map<string, typeof entries>();
  for (const entry of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
    const day = timeLib.formatDate(entry.createdAt);
    const bucket = groups.get(day) ?? [];
    groups.set(day, [...bucket, entry]);
  }

  return (
    <Stack gap="section">
      {[...groups.entries()].map(([day, dayEntries]) => (
        <Stack key={day} gap="field">
          <SectionLabel>{day}</SectionLabel>
          {dayEntries.map((entry) => (
            <Stack key={entry.id} gap="field" className="rounded-card border border-border bg-card px-block py-row" data-slot="rpg-journal-entry">
              <Row gap="field" align="center" className="min-w-0">
                <Icon icon={journalGlyph(entry.type)} size="xs" className="text-muted-foreground" />
                <Text as="span" size="label" weight="semibold" className="min-w-0 flex-1 truncate">
                  {entry.title}
                </Text>
                <Text as="span" size="micro" tone="muted">
                  {entry.type}
                </Text>
              </Row>
              {entry.content === "" ? null : (
                <Text size="label" tone="muted">
                  {entry.content}
                </Text>
              )}
            </Stack>
          ))}
        </Stack>
      ))}
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
          <TrackerValue
            ariaLabel="New mark label"
            display={draftLabel}
            placeholder="Mark this moment…"
            onEdit={setDraftLabel}
            className="h-control-sm flex-1"
          />
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

/** The Journal tab — the chronicle (All) + the checkpoint bookmarks (Marks). */
export function RpgJournalTab({ state }: RpgJournalTabProps): ReactElement {
  const [scope, setScope] = useState<JournalScope>("all");
  return (
    <Stack gap="section" data-slot="rpg-journal-tab">
      <ToggleGroup
        aria-label="Journal scope"
        value={[scope]}
        onValueChange={(next): void => {
          const picked = next[0];
          if (picked === "all" || picked === "marks") {
            setScope(picked);
          }
        }}
      >
        <Toggle value="all">All</Toggle>
        <Toggle value="marks">Marks</Toggle>
      </ToggleGroup>
      {scope === "all" ? <JournalEntries state={state} /> : <JournalMarks state={state} />}
    </Stack>
  );
}
