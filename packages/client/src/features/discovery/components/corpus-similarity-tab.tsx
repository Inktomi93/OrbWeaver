// Similarity renders duplicate findings before the ranked raw cosine-edge list (#554). Raw pairs are
// evidence, not a substitute for findings, and remain available for pairs not flagged by a duplicate pass.
// The list draws a bounded head and states showing N of M; Default control labels resolve their actual
// values.
//
// Character pairs open Compare with both ids; chat pairs open the first room because there is no chat-diff
// surface, and the accessible name states that destination. This remains in-RAM analytics, not retrieval:
// caps/order apply to discovery.similarityGraph and no search path is introduced.
//
// The tab composes the reads, section order, and graph knobs. corpus-duplicate-rows owns finding
// presentation and shared pair-row anatomy; identical-art equivalence classes collapse pairwise rows into
// one finding (#564).

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
  // A Default option must resolve the actual floor, not merely name itself, so the reader can tell why
  // pairs qualify (#554).
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
