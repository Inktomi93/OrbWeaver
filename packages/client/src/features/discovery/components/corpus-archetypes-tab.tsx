// The Corpus CONTEXT "Archetypes" tab — the two clustering views. `archetypes` are k-means clusters of
// card embeddings labelled from distilled facets (writing archetypes); `visualArchetypes` are the same
// over avatar vectors labelled by caption art-style/mood (art archetypes). A shared `k` knob (cluster
// count) re-clusters both in place; each cluster's size is charted as a bar-list, with its label, headline
// facets, and member slice below. Read-only analytics.

import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { BarList } from "@orb/ui/bar-list";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { toBarItems } from "../lib/corpus-charts.ts";
import { ParamSelect } from "./corpus-controls.tsx";
import { CorpusDistillEmptyState } from "./corpus-distill-empty-state.tsx";

interface ArchetypeCard {
  readonly label: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly topTags: readonly string[];
  readonly extra?: readonly (string | null)[];
  readonly size: number;
  readonly members: readonly { readonly characterId: CharacterId; readonly name: string }[];
}

const AUTO = "";
const SKELETON_ROW_COUNT = 3;
const K_ITEMS: SelectItems<string> = [
  { value: AUTO, label: "Auto" },
  { value: "4", label: "4" },
  { value: "6", label: "6" },
  { value: "8", label: "8" },
  { value: "12", label: "12" },
];

export function CorpusArchetypesTab(): ReactElement {
  const trpc = useTRPC();
  const [k, setK] = useState(AUTO);
  const kArg = k === AUTO ? {} : { k: Number(k) };

  const archetypes = useQuery(trpc.discovery.archetypes.queryOptions(kArg));
  const visual = useQuery(trpc.discovery.visualArchetypes.queryOptions(kArg));

  return (
    <Stack className="min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section">
      <ParamSelect label="Clusters" value={k} items={K_ITEMS} onValueChange={setK} />

      <Section heading="Writing archetypes">
        <ClusterView
          isPending={archetypes.isPending}
          error={archetypes.error}
          onRetry={archetypes.refetch}
          clusters={archetypes.data ?? []}
          emptyLabel="No writing archetypes computed yet."
          chartLabel="Writing cluster sizes"
        />
      </Section>

      <Section heading="Art archetypes">
        <ClusterView
          isPending={visual.isPending}
          error={visual.error}
          onRetry={visual.refetch}
          clusters={(visual.data ?? []).map((v) => ({
            label: v.label,
            genre: v.genre,
            tone: v.tone,
            topTags: [],
            extra: [v.artStyle, v.palette, v.mood],
            size: v.size,
            members: v.members,
          }))}
          emptyLabel="No art archetypes computed yet."
          chartLabel="Art cluster sizes"
        />
      </Section>
    </Stack>
  );
}

function ClusterView({
  isPending,
  error,
  onRetry,
  clusters,
  emptyLabel,
  chartLabel,
}: {
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly onRetry: () => void;
  readonly clusters: readonly ArchetypeCard[];
  readonly emptyLabel: string;
  readonly chartLabel: string;
}): ReactElement {
  if (isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (error !== null) {
    return <QueryErrorState label="archetypes" onRetry={onRetry} />;
  }
  if (clusters.length === 0) {
    return <CorpusDistillEmptyState title={emptyLabel} description="Archetypes cluster your distilled, indexed cards. Distill your library, then come back." />;
  }
  return (
    <Stack gap="block">
      <BarList
        label={chartLabel}
        items={toBarItems(
          clusters,
          (cluster) => cluster.label,
          (cluster) => cluster.size,
        )}
      />
      {clusters.map((cluster) => (
        <ClusterCard key={`${cluster.label}-${cluster.members[0]?.characterId ?? "empty"}`} cluster={cluster} />
      ))}
    </Stack>
  );
}

function ClusterCard({ cluster }: { readonly cluster: ArchetypeCard }): ReactElement {
  const facets = [cluster.genre, cluster.tone, ...(cluster.extra ?? [])].filter((v) => v !== null && v !== "");
  return (
    <Stack gap="field">
      <Row align="center" gap="field" justify="between">
        <Text className="font-semibold">{cluster.label}</Text>
        <Text voice="gloss">{cluster.size} members</Text>
      </Row>
      {facets.length > 0 ? <Text voice="kicker">{facets.join(" · ")}</Text> : null}
      {cluster.topTags.length > 0 ? (
        <Row align="center" gap="field" className="flex-wrap">
          {cluster.topTags.map((tag) => (
            <Badge key={tag} intent="neutral" size="sm">
              {tag}
            </Badge>
          ))}
        </Row>
      ) : null}
      <Text voice="gloss">{cluster.members.map((m) => m.name).join(", ")}</Text>
    </Stack>
  );
}
