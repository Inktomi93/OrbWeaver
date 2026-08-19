// The Corpus CONTEXT "Archetypes" tab — the two clustering views. `archetypes` are k-means clusters of
// card embeddings labelled from distilled facets (writing archetypes); `visualArchetypes` are the same
// over avatar vectors, labelled from the VL image breakdown by LIFT (art archetypes). A shared `k` knob (cluster
// count) re-clusters both in place; each cluster's size is charted as a bar-list, with its label, headline
// facets, and member slice below. Read-only analytics.
//
// A CLUSTER'S MEMBERS ARE FACES, not just a name list (issue #139). Both producers carry the member's
// `avatarHash` on the wire (issue #134), and the CONTENT family plates already draw it — this tab printed
// names only because its local card type re-declared `members` WITHOUT the portrait, which typechecks
// (an extra wire field is assignable) and silently drops the field. The member type is derived from the
// verb's own output now, so the tab cannot fall behind the payload again, and the seats come from the ONE
// mapper both surfaces share (`lib/corpus-faces.ts`) so the null→initials degradation is identical.
//
// ── THE TAB GATES ON THE UNDERSTANDING PASS (issue #154, owner-ruled: "if we haven't run it we probably
//    shouldn't show data, seems kind of misleading") ────────────────────────────────────────────────────
// Cluster MEMBERSHIP comes from the embeddings the indexer writes on import; every cluster LABEL on this tab
// comes from the distill pass's facets. On a library that has been indexed but not distilled the k-means
// therefore succeeds perfectly and labels nothing — the audited state was ten rows of "mixed" over a bar
// chart of real sizes, i.e. a confident chart of a question the app has not asked yet. So with zero distilled
// cards this tab renders the INVITATION and nothing else: no bars, no rows, no plates. The `"mixed"` label
// class is unreachable from this surface as a result, which is what the ruling means by it dying with the
// gate — the verb keeps the fallback for the residual post-pass case (a cluster of name-only cards the
// distill pass legitimately skipped), where it is an honest reading rather than a stand-in for "un-run".
//
// THE GATE'S SIGNAL IS THE DOMAIN'S OWN COUNT, not a client heuristic: `discovery.catalog.totalDistilled` is
// a `count(*)` over `character_summaries` scoped through `characters.ownerId` (`verbs/catalog.ts`). It is
// also the read the Corpus CONTENT surface already suspends on, so opening this tab after that surface is a
// cache hit rather than a second question.
//
// ART ARCHETYPES RIDE THE SAME GATE, deliberately — and the reason has now MOVED (issue #164, 2026-08-18).
// The original reason was that art labels "fall back through the distilled genre/tone", so on an undistilled
// library they were "mixed" too. That fallback is GONE: a visual family is named from the VL image breakdown
// by lift, and never from card text — labelling a portrait cluster with the writing's genre was the defect
// (the family grouped by its members' missing art was called "melancholic fantasy"). The hypothetical the old
// note ended on — "if a library ever has captions but no distillation, the art half simply returns with real
// labels" — is now the ordinary case. The gate stays anyway, on its OTHER stated reason, which survives
// intact: splitting the two halves onto separate signals would put two different invitations on one 420px
// tab, and the #154 ruling is one door and one sentence. What an undistilled-but-analysed library loses here
// is only the CONTEXT chips; the CONTENT surface's family map renders the visual labels ungated.

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
import { disambiguateLabels, toBarItems } from "../lib/corpus-charts.ts";
import { toFaceItems } from "../lib/corpus-faces.ts";
import { ParamSelect } from "./corpus-controls.tsx";
import { CorpusDistillEmptyState } from "./corpus-distill-empty-state.tsx";
import { CorpusUnderstandingInvitation } from "./corpus-understanding-invitation.tsx";

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

  const catalog = useQuery(trpc.discovery.catalog.queryOptions());
  const archetypes = useQuery(trpc.discovery.archetypes.queryOptions(kArg));
  const visual = useQuery(trpc.discovery.visualArchetypes.queryOptions(kArg));

  if (catalog.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (catalog.error !== null) {
    return <QueryErrorState label="archetypes" onRetry={catalog.refetch} />;
  }
  if (catalog.data.totalDistilled === 0) {
    // THE UN-RUN STATE: the invitation, and nothing that would read as a finding. Not the cluster knob
    // either — a control that re-clusters data the surface is refusing to show is a control over nothing.
    return (
      <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section" data-slot="archetypes-not-run">
        <CorpusUnderstandingInvitation />
      </Stack>
    );
  }

  return (
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section">
      <ParamSelect label="Clusters" value={k} items={K_ITEMS} onValueChange={setK} />

      {/* ART FIRST, AND THAT IS THE DOOR'S DOING (side-eye corpus re-pass A7). This tab is the destination of
          the CONTENT family map's "All families →", the surface's one drill-out — and it landed the reader at
          the top of WRITING archetypes, a different artifact, with the visual families a full bar-chart and
          ten cluster cards further down. The claim a door makes is where it puts you, not what is somewhere
          on the page it opens; the families are what was asked for, so they are what is under the fold line.
          The writing half loses nothing but its position — it has no door of its own to disappoint. */}
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
  // ONE NAME PER CLUSTER, resolved ONCE (side-eye corpus re-pass B6). The bar and the card below it are two
  // views of the same cluster, so they must not disambiguate independently — and the labeller repeats itself
  // often enough on a homogeneous library that this is the ordinary case, not the edge one.
  const names = disambiguateLabels(clusters.map((cluster) => ({ label: cluster.label, facets: clusterFacets(cluster) })));
  const bars = clusters.map((cluster, index) => ({ name: names[index] ?? cluster.label, size: cluster.size }));
  return (
    <Stack gap="block">
      <BarList
        label={chartLabel}
        items={toBarItems(
          bars,
          (bar) => bar.name,
          (bar) => bar.size,
        )}
      />
      {clusters.map((cluster, index) => (
        <ClusterCard key={`${cluster.label}-${cluster.members[0]?.characterId ?? "empty"}`} cluster={cluster} name={names[index] ?? cluster.label} />
      ))}
    </Stack>
  );
}

/** A cluster's facets, most-distinguishing first: its own labelling inputs (art style · palette · mood, or
 *  genre/tone for the writing half), then its top tags. The disambiguator takes the first one its
 *  same-named peers do NOT share, so the order decides which difference gets printed. */
function clusterFacets(cluster: ArchetypeCard): string[] {
  return [...(cluster.extra ?? []), cluster.genre, cluster.tone, ...cluster.topTags].filter((facet): facet is string => facet !== null && facet !== "");
}

function ClusterCard({ cluster, name }: { readonly cluster: ArchetypeCard; readonly name: string }): ReactElement {
  const facets = [cluster.genre, cluster.tone, ...(cluster.extra ?? [])].filter((v) => v !== null && v !== "");
  return (
    <Stack gap="field">
      <Row align="center" gap="field" justify="between">
        {/* The DISAMBIGUATED name (B6) — the card and its bar are one cluster and must answer to one name. */}
        <Text className="font-semibold">{name}</Text>
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
