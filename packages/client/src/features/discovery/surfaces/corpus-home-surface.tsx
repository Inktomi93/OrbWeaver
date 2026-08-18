// THE CORPUS OVERVIEW — the discovery section's CONTENT when nothing is selected. Rebuilt for program #102
// (density propagation leg 3 of 3) to the owner-picked mockup A "The Cartographer"
// (`reports/design/corpus-mockups/corpus-a-cartographer.html`) WITH the ruled state-swap from issue #127.
//
// ── THE SHAPE, AND WHY IT IS ONE SHAPE ────────────────────────────────────────────────────────────────
// The owner picked A — the visual family map as the glowing focal, Obsidian depth — and ruled the swap the
// mockup RATIONALE flagged rather than pre-deciding: while the library is un-analysed the map is thin (six
// of eight families are singletons and every label is the server's unlabelled `"mixed"` fallback), so it
// cannot carry a focal, and variant B's INVITATION takes it. The moment the semantic pass has produced
// anything the map reclaims it. ONE surface whose focal is analysis-state-driven — never a fork, never a
// separate reduced mode. `lib/corpus-analysis-state.ts` owns the derivation and is unit-tested at every
// phase boundary, including the thin in-between (distilled, no story themes) where the map takes the focal
// while the rail still honestly reads "Story themes & keywords — not run".
//
// CD3 IS WHAT MAKES THE SWAP MANDATORY (density-pass-spec.md §3.2): exactly one element per surface may
// carry accent fill, glow, or elevated shadow at rest. Both islands can paint the focal treatment; exactly
// one is ever told to. A CT pins `[data-corpus-focal]` at count 1 in every phase.
//
// ── WHAT WENT, AND WHAT REPLACED IT (the #99 item-7 / side-eye 2026-08-08 findings, in composition) ────
//   • THE COVERAGE STAT STRIP IS GONE. Five structural zeros at display size above an empty state that
//     already said "nothing". The masthead now states the library in a SENTENCE, one summary readout sits
//     beside it, and every pass's true state — including its completeness — lives in the readiness rail.
//   • THE SEVEN "No … computed yet." NOTES ARE GONE, and not by collapsing them into one empty state
//     either: a section with no data now renders NOTHING AT ALL, because the rail is the single place that
//     says what has not run. A section that prints its own zero note is a wall built one true sentence at
//     a time, and the 2026-08-08 collapse only reduced it from seven bricks to one.
//   • THE DEAD $0.00 COLUMN IS GONE. See `corpus-gem-tiles.tsx`: the trailing magnitude is words returned.
//     Model economics survives as a section that renders only when there is spend to report — on a local
//     instance `modelRouting` is `[]` and the block simply is not there.
//
// ── THE TIER IS `form`, DELIBERATELY (density-pass-spec.md §3.1) ───────────────────────────────────────
// Corpus reads like analytics but it is a surface you LAND on and act from — prose, a focal island, one
// primary door — which is home's own reasoning verbatim. It is the tier that resolves the island's
// `--spacing-block` padding and `--radius-card` radius, which is what the mockup draws and what the glow's
// `before:rounded-(--radius-card)` is a halo for. The dense INSTRUMENT surfaces of this section are its
// CONTEXT tabs, which declare their own.
//
// ── PORTRAITS FOR THE MAP ARRIVE ON THE PAYLOAD ────────────────────────────────────────────────────────
// `ArchetypeMember` carries `avatarHash` (issue #134), so `visualArchetypes` alone dresses the family
// plates. This surface used to ALSO read `discovery.portraitAlignment` purely to join those faces; that
// second owner-scoped read is gone. A member with a null hash degrades to hue-seeded initials. The Visuals
// CONTEXT tab still reads `portraitAlignment` — it is that report's real consumer, and it is untouched.
//
// "THEMES" ON THIS SURFACE IS ALWAYS "STORY THEMES" — the discovery domain's distillation output. It shares
// a word with the app's colour themes and the owner has been caught by that once; the spelling is law here.

import { modelDisplayName } from "@orb/kit/model-name";
import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Sparkles, Users } from "@orb/ui/icons";
import { Container, Grid, Row, Section, Stack, Surface } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Heading, Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { selectCorpusCharacter, setActiveSection } from "#state";
import { CharacterAvatar } from "../components/character-avatar.tsx";
import { CorpusFamilyMap } from "../components/corpus-family-map.tsx";
import { CorpusGemTiles } from "../components/corpus-gem-tiles.tsx";
import { AllStoryThemes, CatalogFacets, KeywordExplorer, StoryThemeDrift } from "../components/corpus-home-charts.tsx";
import { CorpusReadinessRail } from "../components/corpus-readiness-rail.tsx";
import { CorpusUnderstandingInvitation } from "../components/corpus-understanding-invitation.tsx";
import { deriveCorpusAnalysisState } from "../lib/corpus-analysis-state.ts";
import { toBarItems } from "../lib/corpus-charts.ts";

type ThemeLevel = "scene" | "arc";
type ThemeRow = inferOutput<Trpc["discovery"]["home"]>["topSceneThemes"][number];

const MONEY_PRECISION = 2;
const CORPUS_INSIGHT_ROW_ESTIMATE_PX = 52;

function money(value: number): string {
  return `$${value.toFixed(MONEY_PRECISION)}`;
}

interface ThemeSelection {
  readonly clusterIdx: number;
  readonly level: ThemeLevel;
}

export function CorpusHomeSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    // No height/scroll/inset of its own — the CONTENT region owns all three for both corpus surfaces
    // (`corpus-content.tsx`, the Configuration precedent).
    <Surface tier="form">
      <Stack className="outline-none" data-testid={testId("corpusHomeSurface")} ref={surfaceRef} tabIndex={-1}>
        <QueryBoundary
          fallback={<Text voice="gloss">Loading your corpus…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="your corpus" onRetry={retry} />}
        >
          <CorpusHomeBody />
        </QueryBoundary>
      </Stack>
    </Surface>
  );
}

function CorpusHomeBody(): ReactElement {
  const trpc = useTRPC();
  const { data: home } = useSuspenseQuery(trpc.discovery.home.queryOptions());
  const { data: catalog } = useSuspenseQuery(trpc.discovery.catalog.queryOptions());
  // `{}` — the IDENTICAL input the Archetypes CONTEXT tab passes, so opening that tab after this surface is
  // a cache hit rather than a second fetch of the same analytics.
  const { data: families } = useSuspenseQuery(trpc.discovery.visualArchetypes.queryOptions({}));
  const { data: gems } = useSuspenseQuery(trpc.discovery.forgottenGems.queryOptions());
  const { data: unused } = useSuspenseQuery(trpc.discovery.unusedCharacters.queryOptions());
  const { data: routing } = useSuspenseQuery(trpc.discovery.modelRouting.queryOptions());
  const [theme, setTheme] = useState<ThemeSelection | null>(null);
  // HAS THE NEAR-DUP PASS EVER FINISHED? (issue #164 item 4.) A zero from a pass that ran is "none found";
  // a zero from a pass that has never run is "not run", and the rail printed the first for both — the owner
  // reasonably read "none found" on a 327-card ST library as a defect, when the pass simply had not run yet.
  // The queue is the only place that knows, and `workloads.list` with `{}` is the SAME input the invitation's
  // hook already holds, so this is a cache hit rather than a second question. NON-suspending: an unresolved
  // queue must not hold the whole surface, and its honest pre-answer is the conservative "not run".
  const runs = useQuery(trpc.workloads.list.queryOptions({}));
  const duplicatesEverRan = (runs.data ?? []).some((row) => row.kind === "find-duplicates" && row.status === "succeeded");

  const state = deriveCorpusAnalysisState({
    characters: home.coverage.characters,
    familySizes: families.map((family) => family.size),
    distilled: catalog.totalDistilled,
    sceneThemes: home.topSceneThemes.length,
    arcThemes: home.topArcThemes.length,
    duplicateCharacters: home.duplicateCounts.characters,
    duplicateChats: home.duplicateCounts.chats,
    duplicatesEverRan,
  });

  if (state.phase === "empty") {
    // A library with nothing in it is not an un-analysed library — there is nothing to analyse, so the
    // invitation would be an offer to read a blank page. The one honest door is the one that adds a card.
    return (
      <EmptyState
        action={
          <Button intent="primary" onClick={(): void => setActiveSection("characters")} size="sm">
            <Icon icon={Users} size="sm" />
            Go to Characters
          </Button>
        }
        description="Add a character and the corpus starts reading your library back to you."
        icon={<Icon icon={Sparkles} size="lg" />}
        title="Nothing in your library yet"
      />
    );
  }

  const mapIsFocal = state.phase === "analysed";
  const hasStoryThemes = home.topSceneThemes.length > 0 || home.topArcThemes.length > 0;

  return (
    // NO `size`: the container-query context survives (the split answers to THIS pane's inline size — the
    // shell's docked LIST and CONTEXT panels narrow it independently) and no max-width cap centres the page.
    <Container className="w-full">
      <Stack gap="section">
        <Row align="end" className="flex-wrap" gap="section" justify="between">
          <Stack className="min-w-0 flex-1" gap="tight">
            <Text as="span" voice="kicker">
              Library understanding
            </Text>
            <Heading className="max-w-(--reading-measure)" level={1} voice="masthead">
              {state.headline}
            </Heading>
          </Stack>
          {/* The summary readout: ONE `hero` (the voice for THE value, one per surface by law — which is
              why `deriveCorpusAnalysisState` MOVES it with the phase rather than pinning it to a column)
              with its companions at datum weight beside it. Never a strip of display-size zeros. */}
          <Row align="end" className="shrink-0" gap="section">
            <Stack className="text-right" gap="tight">
              <Text as="span" voice="hero">
                {state.hero.value}
              </Text>
              <Text as="span" voice="gloss">
                {state.hero.caption}
              </Text>
            </Stack>
            {state.support.map((figure) => (
              <Stack className="text-right" gap="tight" key={figure.id}>
                <Text as="span" voice="datum">
                  {figure.value}
                </Text>
                <Text as="span" voice="gloss">
                  {figure.caption}
                </Text>
              </Stack>
            ))}
          </Row>
        </Row>

        {/* `min-w-0` IS THE SPLIT (the home leg's P1-1, paid for once already): a grid TRACK CHILD is
            `min-width:auto`, so a track is floored at its content's min-content width and the declared
            1.55fr/1fr silently becomes whatever the widest island demands. */}
        <Grid className="items-start" cols="lead" gap="gutter">
          <Stack className="min-w-0" gap="section">
            {mapIsFocal ? null : <CorpusUnderstandingInvitation />}
            <CorpusFamilyMap families={families} focal={mapIsFocal} />
          </Stack>
          <Stack className="min-w-0" gap="section">
            <CorpusReadinessRail showRerun={mapIsFocal} stages={state.stages} />
          </Stack>
        </Grid>

        <CorpusGemTiles gems={gems} />

        {hasStoryThemes ? (
          <Section kicker="Story themes" level={2}>
            <ThemeGroup label="Scenes" onSelect={setTheme} selected={theme} themes={home.topSceneThemes} />
            <ThemeGroup label="Arcs" onSelect={setTheme} selected={theme} themes={home.topArcThemes} />
            {theme === null ? null : <ThemeDetailCard onDismiss={(): void => setTheme(null)} selection={theme} />}
          </Section>
        ) : null}

        <AllStoryThemes />
        <KeywordExplorer />
        <CatalogFacets catalog={catalog} />
        <StoryThemeDrift />

        {unused.length === 0 ? null : (
          <Section kicker="Never played" level={2}>
            <VirtualList
              aria-label="Never played characters"
              className="max-h-96"
              estimateSize={(): number => CORPUS_INSIGHT_ROW_ESTIMATE_PX}
              fadeEdge={true}
              gapToken="row"
              getItemKey={(character): string => character.characterId}
              items={unused}
              renderItem={(character): ReactElement => (
                <ListRow
                  clickable={true}
                  leading={<CharacterAvatar hash={character.avatarHash} id={character.characterId} name={character.name} />}
                  onClick={(): void => selectCorpusCharacter(character.characterId)}
                  subtitle="Collected but never played"
                  title={character.name}
                />
              )}
            />
          </Section>
        )}

        {routing.length === 0 ? null : (
          <Section kicker="Model economics" level={2}>
            <BarList
              items={toBarItems(
                routing,
                (route) => `${route.genre} → ${modelDisplayName(route.model)}`,
                (route) => route.costUsd,
              )}
              label="Cost by route"
              valueFormatter={money}
            />
          </Section>
        )}
      </Stack>
    </Container>
  );
}

function ThemeGroup({
  label,
  themes,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly themes: readonly ThemeRow[];
  readonly selected: ThemeSelection | null;
  readonly onSelect: (selection: ThemeSelection) => void;
}): ReactElement | null {
  if (themes.length === 0) {
    // The rail says which passes have not run; a per-group note here would say it a third time.
    return null;
  }
  return (
    <Stack gap="field">
      <Text voice="kicker">{label}</Text>
      <Stack aria-label={`${label} story themes`} gap="row" role="list">
        {themes.map((row) => (
          <Row key={row.id} role="listitem">
            <ListRow
              clickable={true}
              onClick={(): void => onSelect({ clusterIdx: row.clusterIdx, level: row.level })}
              selected={selected !== null && selected.clusterIdx === row.clusterIdx && selected.level === row.level}
              subtitle={`${row.size} digests`}
              title={row.name ?? "Unnamed theme"}
            />
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

function ThemeDetailCard({ selection, onDismiss }: { readonly selection: ThemeSelection; readonly onDismiss: () => void }): ReactElement {
  return (
    <Card>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading theme…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the theme" onRetry={retry} />}
      >
        <ThemeDetailBody onDismiss={onDismiss} selection={selection} />
      </QueryBoundary>
    </Card>
  );
}

function ThemeDetailBody({ selection, onDismiss }: { readonly selection: ThemeSelection; readonly onDismiss: () => void }): ReactElement {
  const trpc = useTRPC();
  const { data: detail } = useSuspenseQuery(
    trpc.discovery.themeDetail.queryOptions({
      clusterIdx: selection.clusterIdx,
      level: selection.level,
    }),
  );
  if (detail === null) {
    return (
      <Row align="center" justify="between">
        <Text>This story theme is no longer available.</Text>
        <Button intent="ghost" onClick={onDismiss} size="sm">
          Close
        </Button>
      </Row>
    );
  }
  return (
    <Stack gap="block">
      <Row align="center" justify="between">
        <Text as="span" voice="label">
          {detail.name ?? "Unnamed theme"}
        </Text>
        <Button intent="ghost" onClick={onDismiss} size="sm">
          Close
        </Button>
      </Row>
      <Text voice="gloss">
        {detail.size} digests · {detail.level}
      </Text>
      <Stack gap="row" role="list">
        {detail.members.map((member) => (
          <ListRow
            clickable={true}
            key={member.characterId}
            onClick={(): void => selectCorpusCharacter(member.characterId)}
            subtitle={`${member.count} digests in this story theme`}
            title={member.name}
          />
        ))}
      </Stack>
    </Stack>
  );
}
