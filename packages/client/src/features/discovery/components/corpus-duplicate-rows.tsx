// THE SIMILARITY TAB'S FINDINGS — the three duplicate sections (characters · art · chats) and the pair-row
// anatomy they share with the ranked edge list next door.
//
// WHY THEY LEFT THE TAB (the `component-size` cap, 2026-08-23). `corpus-similarity-tab.tsx` is the tab's
// COMPOSITION: three suspended reads, the section order, and the ranked-edge query with its two knobs. The
// findings then grew the two things #564 says they owed — a cap with its denominator, and the
// equivalence-class collapse — and a section's own copy is not the composition's business. Same seam the
// corpus overview was cut on (`corpus-home-insights.tsx`).
//
// ── ONE FINDING IS ONE ROW (side-eye se-verify-4 N3, issue #564) ──────────────────────────────────────
// "Duplicate art" drew 82 rows / 3,572px — 48% of the tab — with no cap and no denominator, beside a
// sibling that states "closest 40 of 1,664". And the content was COMBINATORIAL: twelve cards sharing one
// placeholder portrait produce C(12,2) = 66 pairs, all at 100%, so ONE fact was rendered sixty-six times.
// Capping alone would have hidden the group behind an arbitrary cut of its own duplicates; the collapse is
// the real fix and the cap is what keeps the remainder bounded. `lib/corpus-duplicate-groups.ts` owns the
// grouping (pure, unit-tested — the transitivity argument for why only IDENTICAL art collapses lives
// there), and all three sections now share one capped-list head so the tab states its truncations the same
// way in all four places.
//
// A CLIQUE'S MEMBERS STAY REACHABLE. The collapsed row is not a summary that loses the cards: each member
// is a door into its own dossier, which is what the 66 pair rows were really offering and what a reader
// wants from "which twelve cards are these?". A bounded run of them is drawn and the overflow is stated —
// the same "showing N of M" contract as the sections themselves.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { compareCorpusPair, revealContextPanel, selectChat, selectCorpusCharacter, setActiveSection } from "#state";
import { groupIdenticalArt } from "../lib/corpus-duplicate-groups.ts";
import { percent } from "../lib/corpus-vocabulary.ts";

type DuplicateCharacterPair = inferOutput<Trpc["discovery"]["duplicateCharacters"]>[number];
type DuplicateChatPair = inferOutput<Trpc["discovery"]["duplicateChats"]>[number];
type ImageDuplicatePair = inferOutput<Trpc["discovery"]["imageDuplicates"]>[number];

/** How many findings a duplicate section DRAWS. The nearest-pairs list next door caps at 40 because it is
 *  the raw material; a FINDINGS section is a list a reader is expected to work through, and twenty rows is
 *  where that stops being plausible. The remainder is stated, never silently cut. */
const FINDING_CAP = 20;
/** How many member names a collapsed clique names before it counts the rest. Eight fits the 384px CONTEXT
 *  panel at two lines; past that the run is a wall and the count is the reading. */
const CLIQUE_NAME_CAP = 8;

/** A section's truncation, stated (#564). Renders nothing when nothing was cut — a denominator that always
 *  equals its numerator is noise, the same rule `chartLabelWithDenominator` follows. */
function CapNote({ shown, total, noun }: { readonly shown: number; readonly total: number; readonly noun: string }): ReactElement | null {
  if (shown >= total) {
    return null;
  }
  return <Muted>{`Showing ${shown.toString()} of ${total.toString()} ${noun}.`}</Muted>;
}

export function CorpusDuplicateCharacters({ pairs }: { readonly pairs: readonly DuplicateCharacterPair[] }): ReactElement {
  const shown = pairs.slice(0, FINDING_CAP);
  return (
    <Section heading="Duplicate characters">
      {/* THREE COUNTS, THREE SCOPES, STATED (side-eye corpus re-pass #2, P2-5). The readiness rail read
          "1 found · 3 identical" while this tab opened on two 100% pairs — three true numbers that look
          like a contradiction because nothing said what each one counts. The pass's own blind spot is the
          reason (`lib/corpus-analysis-state.ts`: it scans one card per content hash, so byte-identical
          cards can never pair), and it belongs beside the list it explains. */}
      <Muted>The near-duplicate pass's pairs. It compares one card per identical copy, so exact duplicates are counted on the readiness rail instead.</Muted>
      {pairs.length === 0 ? (
        <Muted>No near-duplicate characters found.</Muted>
      ) : (
        <Stack gap="row">
          <CapNote noun="pairs" shown={shown.length} total={pairs.length} />
          {shown.map((pair) => (
            <CharacterPairRow idA={pair.characterIdA} idB={pair.characterIdB} key={pair.id} left={pair.nameA} right={pair.nameB} score={pair.similarity} />
          ))}
        </Stack>
      )}
    </Section>
  );
}

export function CorpusDuplicateArt({ pairs }: { readonly pairs: readonly ImageDuplicatePair[] }): ReactElement {
  const { cliques, pairs: leftover } = groupIdenticalArt(pairs);
  const shownPairs = leftover.slice(0, FINDING_CAP);
  return (
    <Section heading="Duplicate art">
      {pairs.length === 0 ? (
        <Muted>No reused/near-identical avatars found.</Muted>
      ) : (
        <Stack gap="row">
          <CapNote noun="pairs" shown={shownPairs.length} total={leftover.length} />
          {cliques.map((clique) => (
            <ArtCliqueRow key={clique.id} memberIds={clique.memberIds} names={clique.names} />
          ))}
          {shownPairs.map((pair) => (
            <CharacterPairRow
              idA={pair.characterIdA}
              idB={pair.characterIdB}
              key={`${pair.characterIdA}-${pair.characterIdB}`}
              left={pair.nameA}
              right={pair.nameB}
              score={pair.similarity}
            />
          ))}
        </Stack>
      )}
    </Section>
  );
}

export function CorpusDuplicateChats({ pairs }: { readonly pairs: readonly DuplicateChatPair[] }): ReactElement {
  const shown = pairs.slice(0, FINDING_CAP);
  return (
    <Section heading="Duplicate chats">
      {pairs.length === 0 ? (
        <Muted>No near-duplicate chats found.</Muted>
      ) : (
        <Stack gap="row">
          {/* THE DOOR SAYS WHERE IT GOES, ONCE (side-eye se-verify-4 N8). A chat pair opens the FIRST room
              — there is no chat-diff surface to send it to — and the row's own `title` tooltip was the only
              place that said so, which a keyboard or touch reader never sees. The rule is the section's, so
              it is stated at the section; each row then names its own destination in its accessible name,
              where a screen-reader user meets it. */}
          <Muted>There is no chat-diff surface yet, so opening a pair opens the first of the two chats — the one named first in the row.</Muted>
          <CapNote noun="pairs" shown={shown.length} total={pairs.length} />
          {shown.map((pair) => (
            <ChatPairRow
              badge={pair.relation}
              chatId={pair.chatIdA}
              key={pair.id}
              left={pair.titleA ?? "Untitled"}
              right={pair.titleB ?? "Untitled"}
              score={pair.similarity}
            />
          ))}
        </Stack>
      )}
    </Section>
  );
}

/** A set of cards that all carry the SAME portrait, as ONE finding — the 66-row expansion collapsed. Each
 *  member is its own door into that character's dossier: the group is the fact, the names are the action. */
function ArtCliqueRow({ memberIds, names }: { readonly memberIds: readonly string[]; readonly names: readonly string[] }): ReactElement {
  const shown = names.slice(0, CLIQUE_NAME_CAP);
  const hidden = names.length - shown.length;
  return (
    <Stack data-slot="corpus-art-clique" gap="tight">
      <Text as="span" voice="label">
        {`${memberIds.length.toString()} cards share this portrait`}
      </Text>
      <Row align="center" className="flex-wrap" gap="field">
        {shown.map((name, index) => (
          <Button
            intent="ghost"
            key={memberIds[index] ?? name}
            onClick={(): void => selectCorpusCharacter(castId<CharacterId>(memberIds[index] ?? ""))}
            size="sm"
          >
            {name}
          </Button>
        ))}
        {hidden > 0 ? <Text voice="gloss">{`+${hidden.toString()} more`}</Text> : null}
      </Row>
    </Stack>
  );
}

/** A pair of CHARACTERS — a door into the Compare tab, seeded with both. The score keeps its own mono
 *  readout inside the control: it is what the row is ABOUT, so a reader hearing the name should hear it. */
export function CharacterPairRow({
  idA,
  idB,
  left,
  right,
  score,
}: {
  readonly idA: CharacterId;
  readonly idB: CharacterId;
  readonly left: string;
  readonly right: string;
  readonly score: number;
}): ReactElement {
  return (
    <Button
      className="w-full justify-between"
      intent="ghost"
      onClick={(): void => {
        // The NAMES travel with the ids (#563): the Compare tab's pickers can only name a selection they
        // can find in their own catalog page, and a pair from this list routinely is not in it.
        compareCorpusPair({ id: idA, name: left }, { id: idB, name: right });
        revealContextPanel("compare");
      }}
      size="wrap"
    >
      <PairFace badge={undefined} left={left} right={right} score={score} />
    </Button>
  );
}

/** A pair of CHATS — a door into the FIRST room. There is no chat-diff surface, and inventing a
 *  destination is worse than naming a real one; the accessible name says which room opens. */
function ChatPairRow({
  chatId,
  left,
  right,
  score,
  badge,
}: {
  readonly chatId: ChatId;
  readonly left: string;
  readonly right: string;
  readonly score: number;
  readonly badge?: string;
}): ReactElement {
  return (
    <Button
      // THE DESTINATION IS IN THE NAME, NOT IN A TOOLTIP (side-eye se-verify-4 N8). This carried
      // `title={`Opens ${left}`}`, which is a hover affordance: invisible to touch, to keyboard, and to a
      // screen reader that announces the button's content instead. An explicit `aria-label` replaces the
      // content-derived name and keeps everything that name carried — both titles and the score — plus the
      // one fact the row could not otherwise state.
      aria-label={`${left} ↔ ${right}, ${percent(score)} similar — opens ${left}`}
      className="w-full justify-between"
      intent="ghost"
      onClick={(): void => {
        // The corpus's one cross-section destination, spelled exactly as chat's own callers spell it
        // (`corpus-hit-rows.tsx`): section first, then the room, so CONTENT is already showing chats when
        // the active chat changes.
        setActiveSection("chats");
        selectChat(chatId);
      }}
      size="wrap"
    >
      <PairFace badge={badge} left={left} right={right} score={score} />
    </Button>
  );
}

/** What a pair row LOOKS like, shared by both doors so the two kinds stay one anatomy. */
function PairFace({
  left,
  right,
  score,
  badge,
}: {
  readonly left: string;
  readonly right: string;
  readonly score: number;
  readonly badge: string | undefined;
}): ReactElement {
  return (
    <Row align="center" className="w-full min-w-0" gap="field" justify="between">
      <Text as="span" className="min-w-0 truncate text-left">
        {left} ↔ {right}
      </Text>
      <Row align="center" className="shrink-0" gap="field">
        {badge === undefined ? null : (
          <Badge intent="neutral" size="sm">
            {badge}
          </Badge>
        )}
        <Text as="span" className="font-mono" voice="gloss">
          {percent(score)}
        </Text>
      </Row>
    </Row>
  );
}

export function Muted({ children }: { readonly children: string }): ReactElement {
  return (
    <Text className="max-w-(--reading-measure-prose)" voice="gloss">
      {children}
    </Text>
  );
}
