// The CONTEXT Field tab's RESTING state — an overview instrument card, not an empty state. The context
// panel is INSTRUMENT tier (density-pass-spec §3.1: "read-mostly, glanceable, many data per cm²"), and a
// panel that opens to 480×1000px of "Open a field to inspect it" beside a data-rich editor fails its tier
// (stickler 2026-08-01 F4). Every datum here is already on the editor's own reads — `character.get` (the
// card the editor renders) and `chat.listChats` (the read the hero's "N chats ›" derives from) — so the
// card costs no new query key and no new freshness driver.
//
// Voice: the four-voice grammar (§2.3) the rpg tabs set — a caps-micro KICKER with a hairline names each
// group, a muted LABEL names each datum, the value is a mono/tabular DATUM, and the quiet second line is a
// GLOSS. The "pick a field" instruction is the card's FOOTER gloss: still the tab's job, no longer its
// entire content.
//
// The counts read the SAVED row (`characterCardFormFromDetail`), not the live draft: the editor header
// already carries the live split, and autosave converges the two within its debounce — one honest source
// per surface beats two numbers disagreeing mid-keystroke.

import type { CharacterId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import { characterCardFormFromDetail, permanentTokenCount, totalTokenCount } from "../lib/character-card-form-model.ts";

/** The greeting the token TOTAL is computed against — the hero previews `greetings[0]` on open. */
const FIRST_GREETING = 0;

const REFINERY_SCORE_DECIMALS = 2;

/** How many tag names the gloss spells out before it summarizes the rest. */
const TAG_GLOSS_LIMIT = 4;

export interface CharacterOverviewCardProps {
  readonly characterId: CharacterId;
}

/** The Field tab at rest: what this card IS (counts · tags · threads) and where it CAME FROM, with the
 *  pick-a-field hint demoted to the footer. */
export function CharacterOverviewCard({ characterId }: CharacterOverviewCardProps): ReactElement {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.character.get.queryOptions({ characterId }));
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({}));

  if (data === undefined) {
    return <Text tone="muted">Loading…</Text>;
  }

  const values = characterCardFormFromDetail(data);
  const chats = (chatsQuery.data ?? []).filter((chat) => chat.participantCharacterIds.includes(data.id));
  const lastMessageAt = chats.reduce<number | null>(
    (latest, chat) => (chat.lastMessageAt === null || (latest ?? 0) >= chat.lastMessageAt ? latest : chat.lastMessageAt),
    null,
  );
  const tagNames = data.tags.filter((tag) => !tag.isHiddenOnCard).map((tag) => tag.name);

  return (
    <Stack gap="section" className="min-h-0 overflow-y-auto" data-slot="character-overview">
      <Stack gap="row">
        {/* A kicker names a SECTION, never a datum (§2.3) — the character's own name is the footer's job. */}
        <Kicker>Card</Kicker>
        <OverviewRow
          label="Tokens"
          value={`${totalTokenCount(values, FIRST_GREETING)} total`}
          gloss={`${permanentTokenCount(values)} permanent — sent every turn`}
          mono={true}
        />
        <OverviewRow label="Openings" value={String(values.greetings.length)} mono={true} />
        <OverviewRow
          label="Tags"
          value={tagNames.length === 0 ? "None" : String(tagNames.length)}
          {...(tagNames.length === 0 ? {} : { gloss: tagGloss(tagNames) })}
          mono={tagNames.length > 0}
        />
        <OverviewRow
          label="Chats"
          value={chats.length === 0 ? "None yet" : String(chats.length)}
          {...(lastMessageAt === null ? {} : { gloss: `last ${timeLib.formatRelative(lastMessageAt)}` })}
          mono={chats.length > 0}
        />
      </Stack>

      <Stack gap="row">
        <Kicker>Origin</Kicker>
        <OverviewRow label="Added" value={timeLib.formatRelative(data.createdAt)} mono={false} />
        <OverviewRow label="Source" value={data.importedFrom ?? "Made here"} mono={data.importedFrom !== null} />
        <OverviewRow label="Handle" value={`@${data.handle}`} mono={true} />
        {data.refinery === null || data.refinery.score === null ? null : (
          <OverviewRow label="Card quality" value={data.refinery.score.toFixed(REFINERY_SCORE_DECIMALS)} mono={true} />
        )}
      </Stack>

      <Text size="micro" tone="muted">
        Pick a field on{" "}
        <Text as="span" size="micro" weight="semibold">
          {data.name}
        </Text>{" "}
        to inspect it here.
      </Text>
    </Stack>
  );
}

/** `rpg · noir · +3 more` — names the tags a glance can hold, counts the tail. */
function tagGloss(names: readonly string[]): string {
  const head = names.slice(0, TAG_GLOSS_LIMIT).join(" · ");
  const rest = names.length - TAG_GLOSS_LIMIT;
  return rest > 0 ? `${head} · +${rest} more` : head;
}

/** The §2.3 KICKER voice — a muted caps-micro group name with a trailing hairline (the rpg tabs' anatomy). */
function Kicker({ children }: { readonly children: string }): ReactElement {
  return (
    <Row gap="field" align="center">
      <Text size="micro" tone="muted" transform="caps" weight="semibold" className="truncate tracking-micro">
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
  readonly gloss?: string;
  readonly mono: boolean;
}): ReactElement {
  return (
    <Stack gap="field" data-slot="overview-row">
      <Row gap="block" align="baseline" justify="between">
        <Text size="label" tone="muted" className="min-w-0 truncate">
          {label}
        </Text>
        <Text size="label" className={mono ? "shrink-0 font-mono tabular-nums" : "shrink-0"}>
          {value}
        </Text>
      </Row>
      {gloss === undefined ? null : (
        <Text size="micro" tone="muted" className="min-w-0 break-words">
          {gloss}
        </Text>
      )}
    </Stack>
  );
}
