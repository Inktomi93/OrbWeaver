// The Corpus CONTEXT "Archetypes" tab — the two clustering views. `archetypes` are k-means clusters of
// card embeddings labelled from distilled facets (writing archetypes); `visualArchetypes` are the same
// over avatar vectors labelled by caption art-style/mood (art archetypes). A shared `k` knob (cluster
// count) re-clusters both in place; each cluster's size is charted as a bar-list, with its label, headline
// facets, and member slice below. Read-only analytics.
//
// A CLUSTER'S MEMBERS ARE FACES, not just a name list (issue #139). Both producers carry the member's
// `avatarHash` on the wire (issue #134), and the CONTENT family plates already draw it — this tab printed
// names only because its local card type re-declared `members` WITHOUT the portrait, which typechecks
// (an extra wire field is assignable) and silently drops the field. The member type is derived from the
// verb's own output now, so the tab cannot fall behind the payload again, and the seats come from the ONE
// mapper both surfaces share (`lib/corpus-faces.ts`) so the null→initials degradation is identical.

import { AvatarStack } from "@orb/ui/avatar-stack";
import { Badge } from "@orb/ui/badge";
import { BarList } from "@orb/ui/bar-list";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { toBarItems } from "../lib/corpus-charts.ts";
import { toFaceItems } from "../lib/corpus-faces.ts";
import { ParamSelect } from "./corpus-controls.tsx";
import { CorpusDistillEmptyState } from "./corpus-distill-empty-state.tsx";

/** The member shape as the verb ACTUALLY returns it — derived, never re-spelled: the tab's own narrower
 *  copy of it is exactly how the portrait went missing on this surface. */
type ClusterMember = inferOutput<Trpc["discovery"]["archetypes"]>[number]["members"][number];

interface ArchetypeCard {
  readonly label: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly topTags: readonly string[];
  readonly extra?: readonly (string | null)[];
  readonly size: number;
  readonly members: readonly ClusterMember[];
}

const AUTO = "";
/** Faces per cluster row. The verb hands back up to 12 members; six `sm` seats is what the CONTEXT pane
 *  affords at its narrowest real width while the member NAMES keep the rest of the row. The true total is
 *  the "N members" count on the row above, so the strip never has to total — hence no "+N" chip, which
 *  computed off this display slice would undercount the cluster. */
const CLUSTER_FACE_SLOTS = 6;
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
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section">
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
      {cluster.members.length > 0 ? (
        <Row align="center" gap="field">
          {/* The strip is ART, like the family plates it mirrors: every seat's name is printed right beside
              it, so a named stack would announce the same people a second time inside a three-line row. */}
          <AvatarStack
            aria-hidden={true}
            className="shrink-0"
            items={toFaceItems(cluster.members, CLUSTER_FACE_SLOTS)}
            max={CLUSTER_FACE_SLOTS + 1}
            shape="rounded"
            size="sm"
          />
          {/* `min-w-0` or the names refuse to wrap below the strip's intrinsic width and push the row wide. */}
          <Text className="min-w-0 flex-1" voice="gloss">
            {cluster.members.map((m) => m.name).join(", ")}
          </Text>
        </Row>
      ) : null}
    </Stack>
  );
}
