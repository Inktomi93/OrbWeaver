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
//
// ── THE FINDINGS MOVED NEXT DOOR (the `component-size` cap, 2026-08-23) ───────────────────────────────
// The three duplicate sections grew what #564 says they owed — a stated cap, and the identical-art
// equivalence-class collapse that turns 66 pairwise rows back into the one finding they were — and this
// file is the tab's COMPOSITION: the three reads, the section ORDER (findings first, raw material after),
// and the ranked-edge query with its two knobs. `corpus-duplicate-rows.tsx` owns what a finding looks like;
// the pair-row anatomy it shares with the list below comes back from there so the two kinds of row stay one
// shape.

import type { CharacterId } from "@orb/kit/ids";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { ParamSelect } from "./corpus-controls.tsx";
import { CharacterPairRow, CorpusDuplicateArt, CorpusDuplicateCharacters, CorpusDuplicateChats, Muted } from "./corpus-duplicate-rows.tsx";

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
      reserveKey="corpus.similarity"
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
      <CorpusDuplicateCharacters pairs={dupChars} />
      <CorpusDuplicateArt pairs={dupArt} />
      <CorpusDuplicateChats pairs={dupChats} />

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
