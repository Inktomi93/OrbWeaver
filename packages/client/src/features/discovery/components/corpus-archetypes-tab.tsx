// Whole-corpus archetype evidence requires distilled cards; CONTENT owns the understanding pass.
import { sentenceCase } from "@orb/kit/strings";
import { AvatarStack } from "@orb/ui/avatar-stack";
import { Badge } from "@orb/ui/badge";
import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import type { CorpusDestination } from "#lib";
import { selectCorpusArtifact, selectCorpusCharacter } from "#state";
import { corpusFamilyAnalysisLabel, resolveCorpusArchetypeNames } from "../lib/corpus-archetype-presentation.ts";
import { toBarItems } from "../lib/corpus-charts.ts";
import { CORPUS_PARAM_NAMES, CORPUS_READ_LABELS, CORPUS_SORTING_DOOR_NAME } from "../lib/corpus-control-names.ts";
import { toFaceItems } from "../lib/corpus-faces.ts";
import { openCorpusOverview } from "../lib/corpus-overview-door.ts";
import { facetLabel } from "../lib/corpus-vocabulary.ts";
import { ParamSelect } from "./corpus-controls.tsx";
import { CorpusRunJobEmptyState } from "./corpus-run-job-empty-state.tsx";

/** The member shape as the verb ACTUALLY returns it — derived, never re-spelled: the tab's own narrower
 *  copy of it is exactly how the portrait went missing on this surface. */
type ClusterMember = inferOutput<Trpc["discovery"]["archetypes"]>[number]["members"][number];

interface ArchetypeCard {
  readonly destination: Extract<CorpusDestination, { kind: "cluster" }>;
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
 *  the strip leaves its census to the row. */
const CLUSTER_FACE_SLOTS = 6;
const CLUSTER_PREVIEW_MEMBERS = 12;
const SKELETON_ROW_COUNT = 3;
const K_ITEMS: SelectItems = [
  { value: AUTO, label: "Auto" },
  { value: "4", label: "4" },
  { value: "6", label: "6" },
  { value: "8", label: "8" },
  { value: "12", label: "12" },
];

export function CorpusArchetypesTab(): ReactElement {
  return (
    <QueryBoundary
      resetKeys={[]}
      fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label={CORPUS_READ_LABELS.archetypes} onRetry={retry} />}
    >
      <ArchetypesBody />
    </QueryBoundary>
  );
}

function ArchetypesBody(): ReactElement {
  const trpc = useTRPC();
  const [k, setK] = useState(AUTO);
  const kArg = k === AUTO ? {} : { k: Number(k) };
  const { data: catalog } = useSuspenseQuery(trpc.discovery.catalog.queryOptions());

  if (catalog.totalDistilled === 0) {
    // THE UN-RUN STATE: the invitation, and nothing that would read as a finding. Not the cluster knob
    // either — a control that re-clusters data the surface is refusing to show is a control over nothing.
    return (
      <Stack className="relative" minHeight="shrinks" gap="section" data-slot="archetypes-not-run">
        <Text prose={true} cap="prose" voice="gloss">
          Archetypes need your characters sorted first.
        </Text>
        <Button variant="ghost" size="sm" onClick={openCorpusOverview}>
          {CORPUS_SORTING_DOOR_NAME}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack className="relative" minHeight="shrinks" gap="section">
      <ParamSelect label={CORPUS_PARAM_NAMES.clusters} value={k} items={K_ITEMS} onValueChange={setK} />

      {/* ART FIRST, AND THAT IS THE DOOR'S DOING (side-eye corpus re-pass A7). This tab is the destination of
          the CONTENT family map's "All families →", the surface's one drill-out — and it landed the reader at
          the top of WRITING archetypes, a different artifact, with the visual families a full bar-chart and
          ten cluster cards further down. The claim a door makes is where it puts you, not what is somewhere
          on the page it opens; the families are what was asked for, so they are what is under the fold line.
          The writing half loses nothing but its position — it has no door of its own to disappoint. */}
      <Section heading="Art archetypes">
        <QueryBoundary
          resetKeys={[kArg]}
          fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label={CORPUS_READ_LABELS.artArchetypes} onRetry={retry} />}
        >
          <ArtClusters kArg={kArg} />
        </QueryBoundary>
      </Section>

      <Section heading="Writing archetypes">
        <QueryBoundary
          resetKeys={[kArg]}
          fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label={CORPUS_READ_LABELS.writingArchetypes} onRetry={retry} />}
        >
          <WritingClusters kArg={kArg} />
        </QueryBoundary>
      </Section>
    </Stack>
  );
}

interface ClusterSectionProps {
  readonly kArg: { readonly k?: number };
}

function ArtClusters({ kArg }: ClusterSectionProps): ReactElement {
  const trpc = useTRPC();
  const { data: visual } = useSuspenseQuery(trpc.discovery.visualArchetypes.queryOptions(kArg));
  return (
    <ClusterView
      clusters={visual.map((v) => ({
        // P3-4: an unnameable cluster is "Unclassified", never the literal token `none` the VL pass
        // writes. Projected once, here, so the bar and the card below it carry the same name.
        destination: { kind: "cluster", cluster: v, visual: true, k: kArg.k ?? null, title: facetLabel(v.label) },
        label: facetLabel(v.label),
        genre: v.genre,
        tone: v.tone,
        topTags: [],
        extra: [v.artStyle, v.palette, v.mood],
        size: v.size,
        members: v.members,
      }))}
      emptyLabel="No art archetypes computed yet."
      emptyHint="Art archetypes group your indexed character portraits, and need more of them than the cluster count. Run Index (embeddings) with Images as the source to read new portraits."
      chartLabel="Art cluster sizes"
    />
  );
}

function WritingClusters({ kArg }: ClusterSectionProps): ReactElement {
  const trpc = useTRPC();
  const { data: archetypes } = useSuspenseQuery(trpc.discovery.archetypes.queryOptions(kArg));
  // Reads the art section's cache entry for its count only: the art section owns that read's loading and error states,
  // and a failed art read must not take this section down with it.
  const art = useQuery(trpc.discovery.visualArchetypes.queryOptions(kArg)).data;
  return (
    <ClusterView
      clusters={archetypes.map((cluster) => ({
        ...cluster,
        destination: { kind: "cluster" as const, cluster, visual: false, k: kArg.k ?? null, title: cluster.label },
      }))}
      emptyLabel="No writing archetypes computed yet."
      emptyHint="Writing archetypes group your indexed cards, and need more of them than the cluster count. Run Index (embeddings) to index new cards."
      // One door per screen: when the art section above already offers it, this one states its emptiness only.
      offerDoor={art === undefined || art.length > 0}
      chartLabel="Writing cluster sizes"
    />
  );
}

function ClusterView({
  clusters,
  emptyLabel,
  emptyHint,
  offerDoor = true,
  chartLabel,
}: {
  readonly clusters: readonly ArchetypeCard[];
  readonly emptyLabel: string;
  /** Names the job that fills this section, by its picker label. */
  readonly emptyHint: string;
  readonly offerDoor?: boolean;
  readonly chartLabel: string;
}): ReactElement {
  if (clusters.length === 0) {
    return <CorpusRunJobEmptyState title={emptyLabel} description={emptyHint} offerDoor={offerDoor} />;
  }
  // ONE NAME PER CLUSTER, resolved ONCE (side-eye corpus re-pass B6). The bar and the card below it are two
  // views of the same cluster, so they must not disambiguate independently — and the labeller repeats itself
  // often enough on a homogeneous library that this is the ordinary case, not the edge one.
  const names = resolveCorpusArchetypeNames(clusters.map((cluster) => cluster.destination.cluster));
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

function ClusterCard({ cluster, name }: { readonly cluster: ArchetypeCard; readonly name: string }): ReactElement {
  const facets = [cluster.genre, cluster.tone, ...(cluster.extra ?? [])].filter((v) => v !== null && v !== "");
  const analysis = "analysedMembers" in cluster.destination.cluster ? corpusFamilyAnalysisLabel(cluster.destination.cluster) : null;
  return (
    // The card is a named group: one character sits in several clusters, so the member doors alone repeat across
    // the tab. The cluster's disambiguated name is the scope that tells them apart.
    <Stack gap="field" role="group" aria-label={name}>
      <Row align="center" gap="field" justify="between">
        {/* The DISAMBIGUATED name (B6) — the card and its bar are one cluster and must answer to one name.
            MULTILINE: a model-authored name outgrows this row, and a nowrap door sets the card's width, so the
            members count beside it paints outside the CONTEXT pane's clip. */}
        <Button wrap={true} variant="ghost" size="sm" onClick={(): void => selectCorpusArtifact({ ...cluster.destination, title: name })}>
          {name}
        </Button>
        <Text voice="gloss">
          {cluster.size} {cluster.size === 1 ? "member" : "members"}
        </Text>
      </Row>
      {analysis === null ? null : <Text voice="gloss">{analysis}</Text>}
      {/* THE FACET CHAIN IS DATA (P3-2): 45-59 characters of distilled tokens, set in the 9.5px UPPERCASE
          band-label register. `kicker` names a SECTION; this names a cluster's contents, so it drops to the
          quiet second-line voice and is cased like the sentence it is. */}
      {facets.length > 0 ? <Text voice="gloss">{sentenceCase(facets.join(" · "))}</Text> : null}
      {cluster.topTags.length > 0 ? (
        <Row align="center" gap="field" wrap={true}>
          {cluster.topTags.map((tag) => (
            <Badge key={tag} size="sm">
              {tag}
            </Badge>
          ))}
        </Row>
      ) : null}
      {cluster.members.length > CLUSTER_PREVIEW_MEMBERS ? (
        <Text voice="gloss">
          Showing {CLUSTER_PREVIEW_MEMBERS} of {cluster.members.length} members. Open the grouping for all members.
        </Text>
      ) : null}
      {cluster.members.length > 0 ? (
        // The names take their own line when the faces leave them less than the field floor: enlarged text grows the faces with it.
        <Row align="center" gap="field" wrap={true}>
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
          {/* EVERY MEMBER IS A DOOR (side-eye populated arm 2026-08-23, [P2-5]). This was one comma-joined
              `gloss` line, and the tab's complete `--map` was TWELVE elements whose only controls were the
              `Clusters` combobox and two chart canvases: 18 clusters naming 569 memberships, none of them
              actable. §14 makes that the wrong region for it — CONTEXT is detail and config OF the active
              artifact, so a panel that tells you 84 characters are "dark fantasy" and gives you no way to
              see one of them is a read-only wall in the one place whose job is acting on things. The Map
              tab one click away already does this right ("Click a card to open its dossier"), and it is
              the same destination: `selectCorpusCharacter` into the CONTENT dossier.

              THE BRIEF'S OTHER ARM — a cluster row FILTERING the LIST pane to its members — is not taken
              here, and deliberately: the browse view holds its four facets in component state
              (`corpus-browse-view.tsx`), so that arm is a state lift plus a synthetic facet the server has
              no axis for. The report offers both; this is the one that is a door rather than a refactor.

              A `wrap`-sized ghost Button per name, not a link list: the same control the gem shelf and
              quick-picks use for "a grid cell whose subject is a character", so the hover/focus/press
              vocabulary is the one this section already teaches. */}
          <Row className="min-inline-0" floor="field" wrap={true} grow={true} gap="tight">
            {cluster.members.slice(0, CLUSTER_PREVIEW_MEMBERS).map((member) => (
              <Button variant="ghost" key={member.characterId} onClick={(): void => selectCorpusCharacter(member.characterId)} size="sm" wrap={true}>
                <Text as="span" ink="muted" voice="label">
                  {member.name}
                </Text>
              </Button>
            ))}
          </Row>
        </Row>
      ) : null}
    </Stack>
  );
}
