// The Corpus CONTEXT "Similarity" tab — the near-relationships + the avatar-dedupe cleanup family.
// `similarityGraph` is rendered as a RANKED EDGE LIST (nameA ↔ nameB + cosine), not a force graph, and
// gains two compute knobs (`minSimilarity` edge floor + `maxNodes` cap) driven as a plain refetching
// query so a knob change re-ranks in place. `duplicateCharacters` / `imageDuplicates` / `duplicateChats`
// list the owner's near-duplicate pairs (text/art/chat) — the chat pairs carry a forked/duplicate badge.

import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { percent } from "../lib/corpus-vocabulary.ts";
import { ParamSelect } from "./corpus-controls.tsx";

const DEFAULT = "";
const SKELETON_ROW_COUNT = 4;

/** The edge floor. The VALUES are the wire's cosines; the labels are the surface's one similarity spelling
 *  (P2-5), so the knob and the rows it filters cannot speak two scales at each other. */
const MIN_SIMILARITY_ITEMS: SelectItems<string> = [
  { value: DEFAULT, label: "Default" },
  { value: "0.5", label: "50%" },
  { value: "0.6", label: "60%" },
  { value: "0.7", label: "70%" },
  { value: "0.8", label: "80%" },
  { value: "0.9", label: "90%" },
];
const MAX_NODES_ITEMS: SelectItems<string> = [
  { value: DEFAULT, label: "Default" },
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
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section">
      <NearestPairs />

      {/* THREE COUNTS, THREE SCOPES, NOW STATED (side-eye corpus re-pass #2, P2-5). The readiness rail read
          "1 found · 3 identical" while this tab opened on two 100% pairs — three true numbers that look
          like a contradiction because nothing said what each one counts. The pass's own blind spot is the
          reason (`lib/corpus-analysis-state.ts`: it scans one representative per content hash, so
          byte-identical cards can never pair), and it belongs beside the list it explains. */}
      <Section heading="Duplicate characters">
        <Muted>The near-duplicate pass's pairs. It compares one card per identical copy, so exact duplicates are counted on the readiness rail instead.</Muted>
        {dupChars.length === 0 ? (
          <Muted>No near-duplicate characters found.</Muted>
        ) : (
          <Stack gap="row">
            {dupChars.map((pair) => (
              <PairRow key={pair.id} left={pair.nameA} right={pair.nameB} score={pair.similarity} />
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
              <PairRow key={`${pair.characterIdA}-${pair.characterIdB}`} left={pair.nameA} right={pair.nameB} score={pair.similarity} />
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
              <PairRow key={pair.id} left={pair.titleA ?? "Untitled"} right={pair.titleB ?? "Untitled"} score={pair.similarity} badge={pair.relation} />
            ))}
          </Stack>
        )}
      </Section>
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
            duplicate sections below do not (P2-5). */}
        <Muted>Every pair above the threshold, ranked — not the near-duplicate pass's findings.</Muted>
        <Row gap="block" className="flex-wrap">
          <ParamSelect label="Min similarity" value={minSimilarity} items={MIN_SIMILARITY_ITEMS} onValueChange={setMinSimilarity} />
          <ParamSelect label="Max nodes" value={maxNodes} items={MAX_NODES_ITEMS} onValueChange={setMaxNodes} />
        </Row>
        <NearestPairsList
          isPending={graph.isPending}
          error={graph.error}
          onRetry={graph.refetch}
          nodes={graph.data?.nodes ?? []}
          edges={graph.data?.edges ?? []}
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
  return (
    <Stack gap="row">
      {ranked.map((edge) => (
        <PairRow
          key={`${edge.source}-${edge.target}`}
          left={nameById.get(edge.source) ?? "?"}
          right={nameById.get(edge.target) ?? "?"}
          score={edge.similarity}
        />
      ))}
    </Stack>
  );
}

function PairRow({
  left,
  right,
  score,
  badge,
}: {
  readonly left: string;
  readonly right: string;
  readonly score: number;
  readonly badge?: string;
}): ReactElement {
  return (
    <Row align="center" gap="field" justify="between">
      <Text className="min-w-0 truncate">
        {left} ↔ {right}
      </Text>
      <Row align="center" gap="field" className="shrink-0">
        {badge !== undefined ? (
          <Badge intent="neutral" size="sm">
            {badge}
          </Badge>
        ) : null}
        <Text voice="gloss" className="font-mono">
          {percent(score)}
        </Text>
      </Row>
    </Row>
  );
}

function Muted({ children }: { readonly children: string }): ReactElement {
  return <Text voice="gloss">{children}</Text>;
}
