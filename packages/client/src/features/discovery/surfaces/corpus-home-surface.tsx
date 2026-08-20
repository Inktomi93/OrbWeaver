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
//   • THE DEAD $0.00 COLUMN IS GONE. See `corpus-gem-tiles.tsx`: the trailing magnitude is tokens returned
//     (labelled as tokens since #174 — it is `tokensOut`, and it shipped calling itself "words").
//     Model economics survives as a section that renders only when there is SPEND to report.
//
// ── THE UN-DRAWN TAIL, CUT (corpus forensics 2026-08-18 §7/§8, R4) ─────────────────────────────────────
// The mock ends after the gem tiles. Everything below it was authored here anyway and measured 6,900px of a
// 9,438px surface — 73% of the page, every pixel of it a `BarList`, which by construction exposes no item
// click. Three blocks are gone, each for its own reason:
//   • MODEL ECONOMICS was guarded on `routing.length === 0` while the paragraph above claimed it renders
//     "only when there is spend to report" — `modelRouting` returns a row per (genre × model) whether or not
//     money moved, so a local instance rendered 134 rows, 133 of them exactly $0.00, at 4,304px. The guard
//     now tests SPEND, which is what the header always said.
//   • THE CATALOG FACET BARS (Genres · Tones · Top tags, 1,904px) duplicated the browse view's own Genre /
//     Tone / Tag selects, WITH the same counts — and those are interactive and narrow the list. Two spellings
//     of one dataset, one of which could not be acted on.
//   • THE "ALL STORY THEMES" BAR CHART (400px) was the non-interactive twin of the theme ROWS 400px above
//     it. The rows survive, and they are now COMPLETE rather than a top-8 slice (`discovery.home`), because
//     with the chart gone they are the only place a theme is met.
// The `discovery.themes` and `discovery.catalog.topTags` reads are untouched — the browse view and the
// context tabs are their real consumers.
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
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId } from "#lib";
import { selectCorpusCharacter, setActiveSection } from "#state";
import { CharacterAvatar } from "../components/character-avatar.tsx";
import { CorpusFamilyMap } from "../components/corpus-family-map.tsx";
import { CorpusGemTiles } from "../components/corpus-gem-tiles.tsx";
import { KeywordExplorer, StoryThemeDrift } from "../components/corpus-home-charts.tsx";
import { CorpusHomeSkeleton } from "../components/corpus-home-skeleton.tsx";
import { CorpusReadinessRail } from "../components/corpus-readiness-rail.tsx";
import { CorpusUnderstandingInvitation } from "../components/corpus-understanding-invitation.tsx";
import { deriveCorpusAnalysisState } from "../lib/corpus-analysis-state.ts";
import { toBarItems } from "../lib/corpus-charts.ts";

type ThemeLevel = "scene" | "arc";
type ThemeRow = inferOutput<Trpc["discovery"]["home"]>["sceneThemes"][number];

const MONEY_PRECISION = 2;
const CORPUS_INSIGHT_ROW_ESTIMATE_PX = 52;

function money(value: number): string {
  return `$${value.toFixed(MONEY_PRECISION)}`;
}

interface ThemeSelection {
  readonly clusterIdx: number;
  readonly level: ThemeLevel;
}

// SECTION ARRIVAL BELONGS TO THE OMNIBOX, AND THIS SURFACE STOPPED COMPETING FOR IT (side-eye corpus
// re-pass #2, P2-4). Both corpus surfaces called `useFocusOnMount` on their own root — a `tabIndex={-1}`
// div with `outline: none` — and CONTENT mounts after LIST, so arriving in Corpus put focus on an 869x7831
// unnamed container: nothing announced, no visible ring, and the pane's real control (the search box the
// LIST surface deliberately focuses, C7) one Tab further away than it looks. A section has ONE arrival
// target; this is not it. Nothing else here focused anything, so the fix is the removal — and the removal
// is DECLARED rather than silent, because `surface-a11y-focus` is otherwise right about every other surface:
// @surface-focus-elsewhere(SearchOmnibox): the corpus LIST pane's omnibox owns this section's arrival focus (corpus-list-surface.tsx, C7); this CONTENT surface mounts second and must not steal it — pinned by tests/client/features/discovery/surfaces/corpus-list-surface.ct.tsx "arriving in the SECTION lands focus in the omnibox".
export function CorpusHomeSurface(): ReactElement {
  return (
    // No height/scroll/inset of its own — the CONTENT region owns all three for both corpus surfaces
    // (`corpus-content.tsx`, the Configuration precedent).
    <Surface tier="form">
      <Stack data-testid={testId("corpusHomeSurface")}>
        {/* The fallback is the surface's own SHAPE, not a sentence (§5 "loading is a naked sentence in a
            void") — `corpus-home-skeleton.tsx` carries the why. */}
        <QueryBoundary fallback={<CorpusHomeSkeleton />} renderError={(_error, retry): ReactElement => <QueryErrorState label="your corpus" onRetry={retry} />}>
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
  const [theme, setTheme] = useState<ThemeSelection | null>(null);
  // HAS THE NEAR-DUP PASS EVER FINISHED? (issue #164 item 4.) A zero from a pass that ran is "none found";
  // a zero from a pass that has never run is "not run", and the rail printed the first for both — the owner
  // reasonably read "none found" on a 327-card ST library as a defect, when the pass simply had not run yet.
  // The queue is the only place that knows, and `workloads.list` with `{}` is the SAME input the invitation's
  // hook already holds, so this is a cache hit rather than a second question. NON-suspending: an unresolved
  // queue must not hold the whole surface, and its honest pre-answer is the conservative "not run".
  const runs = useQuery(trpc.workloads.list.queryOptions({}));
  const ranSuccessfully = (kind: string): boolean => (runs.data ?? []).some((row) => row.kind === kind && row.status === "succeeded");
  // KEYWORDS ARE THEIR OWN PASS (issue #164's lesson, applied one row up). The rail row said "Story themes &
  // keywords" and read story themes ALONE, so it marked the keyword pass done on the theme pass's evidence
  // while `topKeywords` was empty and the dossier printed "No keyword profile computed yet." The keyword
  // tables are written only by `compute-cooccurrence`, which is NOT in the understanding pass's chain — so
  // the row needed both halves of its own state: what it produced, and whether it has ever run.
  // These are below-fold insights. Keeping them non-suspending lets the masthead, focal map, and
  // readiness rail settle from the four above-fold reads rather than making a 203-row list or routing
  // table hold the whole CONTENT boundary. `KeywordExplorer` receives this result rather than reading
  // `topKeywords` again, so one query owns both the rail's state and the below-fold explorer.
  const keywords = useQuery(trpc.discovery.topKeywords.queryOptions());
  const unused = useQuery(trpc.discovery.unusedCharacters.queryOptions());
  const routing = useQuery(trpc.discovery.modelRouting.queryOptions());

  const state = deriveCorpusAnalysisState({
    characters: home.coverage.characters,
    familySizes: families.map((family) => family.size),
    distilled: catalog.totalDistilled,
    sceneThemes: home.sceneThemes.length,
    arcThemes: home.arcThemes.length,
    keywords: keywords.data?.length ?? 0,
    keywordsEverRan: ranSuccessfully("compute-cooccurrence"),
    duplicateCharacters: home.duplicateCounts.characters,
    duplicateChats: home.duplicateCounts.chats,
    identicalCharacterPairs: home.duplicateCounts.identicalCharacterPairs,
    duplicatesEverRan: ranSuccessfully("find-duplicates"),
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
  const hasStoryThemes = home.sceneThemes.length > 0 || home.arcThemes.length > 0;

  return (
    // NO `size`: the container-query context survives (the split answers to THIS pane's inline size — the
    // shell's docked LIST and CONTEXT panels narrow it independently) and no max-width cap centres the page.
    <Container className="w-full">
      <Stack gap="section">
        {/* THE MASTHEAD STACKS BEFORE IT SQUEEZES (side-eye corpus re-pass 2026-08-19, B7). This was one
            `flex-wrap` Row with a `flex-1 min-w-0` headline beside a `shrink-0` figure column — and
            `flex-wrap` never fires for a `min-w-0` child, because it has no minimum to overflow with. So at
            430px the h1 was squeezed into a ~130px column and wrapped to SIX one-word lines while the
            figures held half the row. The container query is the fix the pane can actually answer to
            (`corpus-understanding-invitation.tsx`'s own spelling): one column until the surface's
            `@container` is genuinely wide enough for two, `items-end` only in the two-column arm — a
            right-aligned figure block under a stacked headline would read as a stray. */}
        <Row align="start" className="flex-col @2xl:flex-row @2xl:items-end" gap="section" justify="between">
          <Stack className="min-w-0 flex-1" gap="tight">
            <Text as="span" voice="kicker">
              Library understanding
            </Text>
            <Heading className="max-w-(--reading-measure)" level={1} voice="masthead">
              {state.headline}
            </Heading>
          </Stack>
          {/* The summary readout: ONE `hero` (the voice for THE value, at most one per surface by law —
              which is why `deriveCorpusAnalysisState` MOVES it with the phase rather than pinning it to a
              column) with its companions at datum weight beside it. Never a strip of display-size zeros —
              and never a number the headline just said, which is why the whole block is absent when the
              sentence already carries the library's state (§5 `distill`). */}
          {/* THE FIGURES ARE RIGHT-ALIGNED ONLY WHERE THERE IS A RIGHT EDGE TO ALIGN TO (side-eye corpus
              re-pass #2, P2-6). `text-right` was unconditional, so in every STACKED arm — mobile, the
              three-pane width, the reading preset — the numeral floated at the right edge of its own
              content-sized column (measured x≈79 in a container whose text edge is 24) instead of lining up
              with the h1 above it. Right-alignment is a two-column relationship; it belongs to the arm that
              has two columns, which is the same `@2xl` the masthead itself flips on. */}
          {state.hero === null ? null : (
            <Row align="end" className="shrink-0" gap="section">
              <Stack className="@2xl:text-right" gap="tight">
                <Text as="span" voice="hero">
                  {state.hero.value}
                </Text>
                <Text as="span" voice="gloss">
                  {state.hero.caption}
                </Text>
              </Stack>
              {state.support.map((figure) => (
                <Stack className="@2xl:text-right" gap="tight" key={figure.id}>
                  <Text as="span" voice="datum">
                    {figure.value}
                  </Text>
                  <Text as="span" voice="gloss">
                    {figure.caption}
                  </Text>
                </Stack>
              ))}
            </Row>
          )}
        </Row>

        {/* `min-w-0` IS THE SPLIT (the home leg's P1-1, paid for once already): a grid TRACK CHILD is
            `min-width:auto`, so a track is floored at its content's min-content width and the declared
            1.55fr/1fr silently becomes whatever the widest island demands.

            `leadEarly`, NOT `lead` (#244 P1-2): `lead` breathes at `@4xl` (896px) and this pane measures
            868.81px in the shipped default view — list docked, context collapsed — so the composition the
            owner picked was one he had literally never seen, in any appearance arm. The arm carries the
            same two tracks a step sooner; the container query still stacks them for the three-pane and
            phone states.

            NO `items-start`, AND THE RAIL NO LONGER SPREADS INTO WHAT THAT BUYS (re-pass §5, then re-pass
            #2 P2-1). The default `stretch` hands both tracks the ROW's height, which is why the rail's
            Section can carry `h-full` and keep its band whole; what was REVERSED is the second half — the
            rail distributing its hairline rows over that height, which measured a uniform 101px pitch over
            ~33px of ink. The rail's rows are natural again and the leftover under them is the island's to
            own. The left track is unaffected: its children are content-height in a stretched flex column
            either way. */}
        <Grid cols="leadEarly" gap="gutter">
          <Stack className="min-w-0" gap="section">
            {mapIsFocal ? null : <CorpusUnderstandingInvitation />}
            {/* `totalDistilled` is the ARCHETYPES TAB's own gate signal (#154) — the door's viability is the
                destination's fact, so it travels down rather than being guessed at here (A7). */}
            <CorpusFamilyMap canOpenFamilies={catalog.totalDistilled > 0} families={families} focal={mapIsFocal} />
          </Stack>
          <Stack className="min-w-0" gap="section">
            <CorpusReadinessRail showRerun={mapIsFocal} stages={state.stages} />
          </Stack>
        </Grid>

        <CorpusGemTiles gems={gems} />

        {hasStoryThemes ? (
          <Section kicker="Story themes" level={2}>
            <ThemeGroup label="Scenes" onSelect={setTheme} selected={theme} themes={home.sceneThemes} />
            <ThemeGroup label="Arcs" onSelect={setTheme} selected={theme} themes={home.arcThemes} />
            {theme === null ? null : <ThemeDetailCard onDismiss={(): void => setTheme(null)} selection={theme} />}
          </Section>
        ) : null}

        {keywords.error !== null ? <QueryErrorState label="your top keywords" onRetry={keywords.refetch} /> : <KeywordExplorer top={keywords.data} />}
        <StoryThemeDrift />

        {unused.error !== null ? <QueryErrorState label="your never-played characters" onRetry={unused.refetch} /> : null}
        {unused.data === undefined || unused.data.length === 0 ? null : (
          <Section kicker="Never played" level={2}>
            <VirtualList
              aria-label="Never played characters"
              className="max-h-96"
              estimateSize={(): number => CORPUS_INSIGHT_ROW_ESTIMATE_PX}
              fadeEdge={true}
              gapToken="row"
              getItemKey={(character): string => character.characterId}
              items={unused.data}
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

        {/* SPEND, not rows: a local-model instance records a route per (genre × model) and zero dollars. */}
        {routing.error !== null ? <QueryErrorState label="your model economics" onRetry={routing.refetch} /> : null}
        {routing.data === undefined || routing.data.every((route) => route.costUsd <= 0) ? null : (
          <Section kicker="Model economics" level={2}>
            <BarList
              items={toBarItems(
                routing.data,
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
