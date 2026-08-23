// The CONTEXT Field tab's RESTING state — an overview instrument card, not an empty state. The context
// panel is INSTRUMENT tier (density-pass-spec §3.1: "read-mostly, glanceable, many data per cm²"), and a
// panel that opens to 480×1000px of "Open a field to inspect it" beside a data-rich editor fails its tier
// (stickler 2026-08-01 F4).
//
// IT CARRIES WHAT CONTENT DOES NOT (#513, side-eye 2026-08-22 rail-characters P2-4 — "the context pane is a
// read-only echo"). The card shipped as Tokens · Openings · Tags · Chats over Origin, and at 1280px with the
// editor open FOUR of those printed twice on one screen: the header's `1257 total · 1017 permanent`, the
// hero's `@handle`, its `1 chat ›`, the tags row, and the greeting pills that ARE the openings count. A pane
// spending 384px restating what is 300px to its left has not found a job. So the echo group is gone and the
// rows that replaced it are the ones CONTENT never shows:
//
//   ORIGIN    where this card came from — added / source / card quality (handle dropped: the hero prints it)
//   LINKS     the world books + personas attached to her (the Links TAB's data, one glance ahead of it)
//   OPTIONS   the render posture her card carries — HTML trust, external media (the Options TAB's, likewise)
//   ACTIVITY  when you two last spoke — the one chat fact the hero's count does NOT state
//
// THE F4 RULING SURVIVES, ITS INPUT CHANGED. F4 refused a panel with NOTHING to inspect; it never required
// these particular datums, and a card of four groups is still an instrument. The pick-a-field instruction
// stays the FOOTER gloss.
//
// COST: two reads join `character.get` + `chat.listChats` — `worldInfo.listForCharacter` and
// `persona.listConnectedToCharacter`, both the SAME query keys the CONTEXT Links tab one tab over already
// uses, so the pair is a cache hit the moment either has been opened and a small per-character read
// otherwise. (The card's original "no new query key" claim is retired with the echo rows that made it true.)
//
// Voice: the four-voice grammar (§2.3) the rpg tabs set — a caps-micro KICKER with a hairline names each
// group, a muted LABEL names each datum, the value is a mono/tabular DATUM, and the quiet second line is a
// GLOSS.

import type { CharacterId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import { EMPTY_VALUE } from "../lib/empty-vocabulary.ts";

const REFINERY_SCORE_DECIMALS = 2;

/** The card wants her newest thread's stamp, and that is all — the smallest page that carries it. */
const NEWEST_THREAD_ONLY = 1;

/** How many names a link row spells out before it summarizes the rest. */
const NAME_GLOSS_LIMIT = 4;

/** A time fact with no answer is NEVER, which is a different claim from an empty slot (`EMPTY_VALUE`). */
const NEVER = "Never";

export interface CharacterOverviewCardProps {
  readonly characterId: CharacterId;
}

/** The Field tab at rest: where this card CAME FROM, what it is linked to, how it renders, and when you two
 *  last spoke — with the pick-a-field hint demoted to the footer. */
export function CharacterOverviewCard({ characterId }: CharacterOverviewCardProps): ReactElement {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.character.get.queryOptions({ characterId }));
  // HER page-of-one (2026-08-09): `items[0]` is her newest-updated thread, and the list's own order is
  // last-activity — so that row IS the last time you two spoke, and it is the same row the chats projection's
  // identity gloss reads, so the two surfaces cannot print different "last" times.
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({ characterId, limit: NEWEST_THREAD_ONLY }));
  const booksQuery = useQuery(trpc.worldInfo.listForCharacter.queryOptions({ characterId }));
  const personasQuery = useQuery(trpc.persona.listConnectedToCharacter.queryOptions({ characterId }));

  if (data === undefined) {
    return <Text voice="quiet">Loading…</Text>;
  }

  const newest = chatsQuery.data?.items[0];
  const lastMessageAt = newest === undefined ? null : (newest.lastMessageAt ?? newest.updatedAt);
  const books = booksQuery.data ?? [];
  const personas = personasQuery.data ?? [];

  return (
    <Stack gap="section" className="relative min-h-0 overflow-y-auto" data-slot="character-overview">
      <Stack gap="row">
        {/* A kicker names a SECTION, never a datum (§2.3) — the character's own name is the footer's job. */}
        <Kicker>Origin</Kicker>
        <OverviewRow label="Added" value={timeLib.formatRelative(data.createdAt)} mono={false} />
        <OverviewRow label="Source" value={data.importedFrom ?? "Made here"} mono={data.importedFrom !== null} />
        {data.refinery === null || data.refinery.score === null ? null : (
          <OverviewRow label="Card quality" value={data.refinery.score.toFixed(REFINERY_SCORE_DECIMALS)} mono={true} />
        )}
      </Stack>

      <Stack gap="row">
        <Kicker>Links</Kicker>
        <LinkRow label="World books" names={books.map((book) => book.name)} />
        <LinkRow label="Personas" names={personas.map((persona) => persona.name)} />
      </Stack>

      <Stack gap="row">
        <Kicker>Options</Kicker>
        {/* The card's own render-policy COLUMNS, stated as what they mean rather than as tri-state nulls —
            `null` is "whatever this deployment says", which is an answer, not a blank. Nothing on CONTENT
            says either of these; the Options tab is where you CHANGE them. */}
        <OverviewRow
          label="HTML"
          value={trustLabel(data.trustHtml)}
          mono={false}
          gloss={data.trustHtml === null ? "follows the deployment default" : undefined}
        />
        <OverviewRow label="External media" value={externalMediaLabel(data.forbidExternalMedia)} mono={false} />
      </Stack>

      <Stack gap="row">
        <Kicker>Activity</Kicker>
        {/* RECENCY, NOT A CENSUS: the hero's "N chats ›" is the count, 300px away and always on screen. */}
        <OverviewRow label="Last chat" value={lastMessageAt === null ? NEVER : timeLib.formatRelative(lastMessageAt)} mono={false} />
      </Stack>

      <Text voice="gloss">
        Pick a field on{" "}
        {/* RATIFIED raw axes (#573): this is INLINE EMPHASIS inside another voice's run, not a voice of its
            own — every voice re-spells size and color, so one here would break the sentence it sits in. It
            carries `gloss`'s own micro step plus the weight and foreground ink that make the name stand out. */}
        <Text as="span" size="micro" weight="semibold">
          {data.name}
        </Text>{" "}
        to inspect it here.
      </Text>
    </Stack>
  );
}

/** The DEPLOYMENT-INHERITING arm of the two tri-state render-policy columns — a real answer, not a blank. */
const POLICY_DEFAULT = "Default";

/** The tri-state trust column in words. `null` = inherit the deployment floor. */
function trustLabel(trustHtml: boolean | null): string {
  if (trustHtml === null) {
    return POLICY_DEFAULT;
  }
  return trustHtml ? "Trusted" : "Untrusted";
}

/** The tri-state external-media column in words. `true` FORBIDS (the column is a prohibition, not a grant). */
function externalMediaLabel(forbidExternalMedia: boolean | null): string {
  if (forbidExternalMedia === null) {
    return POLICY_DEFAULT;
  }
  return forbidExternalMedia ? "Blocked" : "Allowed";
}

/** `rpg · noir · +3 more` — names the entries a glance can hold, counts the tail. */
function nameGloss(names: readonly string[]): string {
  const head = names.slice(0, NAME_GLOSS_LIMIT).join(" · ");
  const rest = names.length - NAME_GLOSS_LIMIT;
  return rest > 0 ? `${head} · +${rest} more` : head;
}

/** A LINKS row: the count as the datum, the names as the gloss — and the house empty word when there are
 *  none (#502), never a bare `0` a reader has to interpret. */
function LinkRow({ label, names }: { readonly label: string; readonly names: readonly string[] }): ReactElement {
  return (
    <OverviewRow
      label={label}
      value={names.length === 0 ? EMPTY_VALUE : String(names.length)}
      {...(names.length === 0 ? {} : { gloss: nameGloss(names) })}
      mono={names.length > 0}
    />
  );
}

/** The §2.3 KICKER voice — a muted caps-micro group name with a trailing hairline (the rpg tabs' anatomy). */
function Kicker({ children }: { readonly children: string }): ReactElement {
  return (
    <Row gap="field" align="center">
      <Text voice="kicker" className="truncate">
        {children}
      </Text>
      <Separator className="flex-1" />
    </Row>
  );
}

/** One LABEL / DATUM pair with an optional GLOSS second line. `mono` is the datum's numeric skin — a
 *  measurement reads in mono tabular figures, a phrase ("Made here", "3m ago") reads as prose. */
function OverviewRow({
  label,
  value,
  gloss,
  mono,
}: {
  readonly label: string;
  readonly value: string;
  readonly gloss?: string | undefined;
  readonly mono: boolean;
}): ReactElement {
  return (
    <Stack gap="field" data-slot="overview-row">
      <Row gap="block" align="baseline" justify="between">
        {/* The grammar's name/value pair (#573): the row's own MUTED name rides className, because `tone`
            is declared before `voice` and loses the merge — the ratified spelling for an intentional tone.
            The value is a `datum` when it is mono/tabular and a `label` otherwise; both were spelled
            `size="label"` before, which is the A3-red internal axis. */}
        <Text voice="label" className="min-w-0 truncate text-muted-foreground">
          {label}
        </Text>
        <Text voice={mono ? "datum" : "label"} className="shrink-0">
          {value}
        </Text>
      </Row>
      {gloss === undefined ? null : (
        <Text voice="gloss" className="min-w-0 break-words">
          {gloss}
        </Text>
      )}
    </Stack>
  );
}
