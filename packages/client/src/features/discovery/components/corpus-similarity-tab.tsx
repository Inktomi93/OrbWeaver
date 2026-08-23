// The Corpus CONTEXT "Similarity" tab — the near-duplicate FINDINGS, then the raw ranked-edge list they
// were found in. `duplicateCharacters` / `imageDuplicates` / `duplicateChats` list the owner's
// near-duplicate pairs (text/art/chat); `similarityGraph` is rendered as a RANKED EDGE LIST (nameA ↔ nameB
// + cosine), not a force graph, with two compute knobs (`minSimilarity` edge floor + `maxNodes` cap) driven
// as a plain refetching query so a knob change re-ranks in place.
//
// ── THE THREE THINGS THIS TAB GOT WRONG AT 327 CHARACTERS (side-eye populated arm 2026-08-23, #554) ────
// Every one of them was invisible at the 12-character library the previous pass reviewed, where the edge
// list was ONE pair.
//
//   1. THE FINDINGS WERE BURIED UNDER THE RAW MATERIAL. Measured inside the 384px CONTEXT panel:
//      `panelScrollH: 56177` against `panelClientH: 1493` — 37.6 screens — with the three duplicate
//      headings at offsets 52,151 / 52,270 / 54,882px. The tab's three named jobs began ~87 scroll flicks
//      down, past a wall of text. The ORDER IS THE FIX: `Nearest pairs` is the corpus of pairs the
//      duplicate passes SEARCHED; the duplicate sections are what they FOUND. Findings first, evidence
//      after — and the raw list keeps its place at the foot rather than being deleted, because it is the
//      only surface that can show a pair the passes did not flag.
//
//   2. THE RAW LIST WAS UNBOUNDED. 1,782 rows, and the `Max nodes` control that would have bounded it read
//      "Default" — so a reader could see neither that the default admits 1,782 pairs nor what to change it
//      to. It draws a HEAD now, with "showing N of M" stated on the section itself, and the knob's Default
//      option says what the default is instead of naming itself.
//
//   3. NOT ONE ROW WAS A CONTROL. `pairRows: 1782 · clickablePairs: 0`; the tab's whole `--map` was two
//      comboboxes. And the data is good — `Ayami — Aug 18, 2025 (3) ↔ Ayami — Aug 19, 2025 (4) · forked ·
//      100%` is exactly the actionable, disambiguated row this section needed — it just could not be acted
//      on. Every pair row is a door now, to the surface that answers the question the row poses:
//        • a CHARACTER pair (nearest pairs, duplicate characters, duplicate art) opens the COMPARE tab
//          pre-filled with both ids (`state/corpus-compare-store.ts`), which is the app's existing answer
//          to "are these two the same?" and was previously reachable only by naming both from a dropdown;
//        • a CHAT pair opens the first room, because there is no chat-diff surface to send it to and a door
//          onto something that does not exist is the defect this whole pass deletes. The row says so in its
//          accessible name rather than leaving the reader to find out by clicking.
//
// THE IN-RAM COSINE STAYS ANALYTICS (Knowledge-Cluster boundary). Nothing here reaches for `search`: the
// cap, the ordering and the section order are all applied to what `discovery.similarityGraph` already
// returned. This tab does no retrieval and gained none.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { compareCorpusPair, revealContextPanel, selectChat, setActiveSection } from "#state";
import { percent } from "../lib/corpus-vocabulary.ts";
import { ParamSelect } from "./corpus-controls.tsx";

const DEFAULT = "";
const SKELETON_ROW_COUNT = 4;
/**
 * How many edges the raw pair list DRAWS.
 *
 * The verb's own default admitted 1,782 on the audited library, which rendered 52,151px of un-clickable
 * text above the sections a reader came for. Forty is a scrollable-but-finite head of a ranked list — the
 * top of the distribution is where near-duplicates live, and everything below it is served better by
 * raising `Min similarity` (which re-ranks server-side) than by scrolling. The count is stated, so the
 * truncation is a fact rather than a silent edge.
 */
const NEAREST_PAIR_CAP = 40;

/** The edge floor. The VALUES are the wire's cosines; the labels are the surface's one similarity spelling
 *  (P2-5), so the knob and the rows it filters cannot speak two scales at each other. */
const MIN_SIMILARITY_ITEMS: SelectItems<string> = [
  // "Default" NAMED ITSELF and nothing else (#554 / the re-pass's standing "Sort reads Default" finding):
  // three sibling controls on this section resolve their value and this one did not, so the reader could
  // not tell what floor was in force or that it was the reason 1,782 pairs qualified.
  { value: DEFAULT, label: "Any similarity" },
  { value: "0.5", label: "50%" },
  { value: "0.6", label: "60%" },
  { value: "0.7", label: "70%" },
  { value: "0.8", label: "80%" },
  { value: "0.9", label: "90%" },
];
const MAX_NODES_ITEMS: SelectItems<string> = [
  { value: DEFAULT, label: "All characters" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];

export function CorpusSimilarityTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="similarity" onRetry={retry} />}
    >
      <SimilarityBody />
    </QueryBoundary>
  );
}

function SimilarityBody(): ReactElement {
  const trpc = useTRPC();
  const { data: dupChars } = useSuspenseQuery(trpc.discovery.duplicateCharacters.queryOptions());
  const { data: dupChats } = useSuspenseQuery(trpc.discovery.duplicateChats.queryOptions());
  const { data: dupArt } = useSuspenseQuery(trpc.discovery.imageDuplicates.queryOptions());

  return (
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-slot="corpus-similarity-tab" gap="section">
      {/* THE FINDINGS LEAD (#554). These three sections used to sit 52,151px below the raw edge list. */}
      <Section heading="Duplicate characters">
        {/* THREE COUNTS, THREE SCOPES, STATED (side-eye corpus re-pass #2, P2-5). The readiness rail read
            "1 found · 3 identical" while this tab opened on two 100% pairs — three true numbers that look
            like a contradiction because nothing said what each one counts. The pass's own blind spot is the
            reason (`lib/corpus-analysis-state.ts`: it scans one representative per content hash, so
            byte-identical cards can never pair), and it belongs beside the list it explains. */}
        <Muted>The near-duplicate pass's pairs. It compares one card per identical copy, so exact duplicates are counted on the readiness rail instead.</Muted>
        {dupChars.length === 0 ? (
          <Muted>No near-duplicate characters found.</Muted>
        ) : (
          <Stack gap="row">
            {dupChars.map((pair) => (
              <CharacterPairRow idA={pair.characterIdA} idB={pair.characterIdB} key={pair.id} left={pair.nameA} right={pair.nameB} score={pair.similarity} />
            ))}
          </Stack>
        )}
      </Section>

      <Section heading="Duplicate art">
        {dupArt.length === 0 ? (
          <Muted>No reused/near-identical avatars found.</Muted>
        ) : (
          <Stack gap="row">
            {dupArt.map((pair) => (
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

      <Section heading="Duplicate chats">
        {dupChats.length === 0 ? (
          <Muted>No near-duplicate chats found.</Muted>
        ) : (
          <Stack gap="row">
            {dupChats.map((pair) => (
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

      <NearestPairs />
    </Stack>
  );
}

/** The ranked edge list — a plain query so the two compute knobs re-rank in place (no tab re-suspend). */
function NearestPairs(): ReactElement {
  const trpc = useTRPC();
  const [minSimilarity, setMinSimilarity] = useState(DEFAULT);
  const [maxNodes, setMaxNodes] = useState(DEFAULT);

  const graph = useQuery(
    trpc.discovery.similarityGraph.queryOptions({
      ...(minSimilarity === DEFAULT ? {} : { minSimilarity: Number(minSimilarity) }),
      ...(maxNodes === DEFAULT ? {} : { maxNodes: Number(maxNodes) }),
    }),
  );

  return (
    <Section heading="Nearest pairs">
      <Stack gap="block">
        {/* …and this list is the WHOLE graph above the threshold, which is why it can show pairs the
            duplicate sections above do not (P2-5). */}
        <Muted>Every pair above the threshold, ranked — not the near-duplicate pass's findings.</Muted>
        <Row className="flex-wrap" gap="block">
          <ParamSelect items={MIN_SIMILARITY_ITEMS} label="Min similarity" onValueChange={setMinSimilarity} value={minSimilarity} />
          <ParamSelect items={MAX_NODES_ITEMS} label="Max nodes" onValueChange={setMaxNodes} value={maxNodes} />
        </Row>
        <NearestPairsList
          edges={graph.data?.edges ?? []}
          error={graph.error}
          isPending={graph.isPending}
          nodes={graph.data?.nodes ?? []}
          onRetry={graph.refetch}
        />
      </Stack>
    </Section>
  );
}

interface GraphNode {
  readonly characterId: CharacterId;
  readonly name: string;
}
interface GraphEdge {
  readonly source: CharacterId;
  readonly target: CharacterId;
  readonly similarity: number;
}

function NearestPairsList({
  isPending,
  error,
  onRetry,
  nodes,
  edges,
}: {
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly onRetry: () => void;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}): ReactElement {
  if (isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (error !== null) {
    return <QueryErrorState label="the similarity graph" onRetry={onRetry} />;
  }
  if (edges.length === 0) {
    return <Muted>No similarity edges at this threshold.</Muted>;
  }
  const nameById = new Map(nodes.map((node) => [node.characterId, node.name]));
  const ranked = edges.toSorted((a, b) => b.similarity - a.similarity);
  const shown = ranked.slice(0, NEAREST_PAIR_CAP);
  return (
    <Stack gap="row">
      {/* THE TRUNCATION IS A STATED FACT, not a silent edge (#554). A list that simply stops at 40 of
          1,782 is the never-played defect in another section's clothing — and the sentence names the knob
          that changes it, because "raise the floor" is the real answer to "there are too many". */}
      {shown.length < ranked.length ? (
        <Muted>{`Showing the closest ${shown.length.toString()} of ${ranked.length.toString()} pairs — raise Min similarity to narrow the field.`}</Muted>
      ) : null}
      {shown.map((edge) => (
        <CharacterPairRow
          idA={edge.source}
          idB={edge.target}
          key={`${edge.source}-${edge.target}`}
          left={nameById.get(edge.source) ?? "?"}
          right={nameById.get(edge.target) ?? "?"}
          score={edge.similarity}
        />
      ))}
    </Stack>
  );
}

/** A pair of CHARACTERS — a door into the Compare tab, seeded with both. The score keeps its own mono
 *  readout inside the control: it is what the row is ABOUT, so a reader hearing the name should hear it. */
function CharacterPairRow({
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
        compareCorpusPair(idA, idB);
        revealContextPanel("compare");
      }}
      size="wrap"
    >
      <PairFace badge={undefined} left={left} right={right} score={score} />
    </Button>
  );
}

/** A pair of CHATS — a door into the FIRST room. There is no chat-diff surface, and inventing a
 *  destination is worse than naming a real one; the label says which room opens. */
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
      title={`Opens ${left}`}
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

function Muted({ children }: { readonly children: string }): ReactElement {
  return (
    <Text className="max-w-(--reading-measure)" voice="gloss">
      {children}
    </Text>
  );
}
