// The Corpus CONTENT overview (nothing selected) — the composed library-understanding home. It reads
// the discovery verbs: `home` (index coverage + top scene/arc themes + near-duplicate counts), `catalog`
// (distilled facet counts + top tags, charted as bar-lists), the `themes` browse-all drill, the keyword
// explorer (`topKeywords` bar-list → `cooccurringKeywords` drill), and four insights — `forgottenGems`
// (invested but quiet), `unusedCharacters` (never played), `modelRouting` (per-genre economics, cost as a
// bar-list), and `themeDrift` (how themes move over story time, scene↔arc toggle). Theme rows drill inline
// into `themeDetail`; a gem / unused row selects that character's dossier into CONTENT.

import { modelDisplayName } from "@orb/kit/model-name";
import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId, timeLib, useFocusOnMount } from "#lib";
import { selectCorpusCharacter } from "#state";
import { CharacterAvatar } from "../components/character-avatar.tsx";
import { AllThemes, FacetBars, KeywordExplorer, ThemeDrift } from "../components/corpus-home-charts.tsx";
import { CorpusRunJobEmptyState } from "../components/corpus-run-job-empty-state.tsx";
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
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none" data-testid={testId("corpusHomeSurface")}>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading your corpus…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your corpus" onRetry={retry} />}
      >
        <CorpusHomeBody />
      </QueryBoundary>
    </Stack>
  );
}

function CorpusHomeBody(): ReactElement {
  const trpc = useTRPC();
  const { data: home } = useSuspenseQuery(trpc.discovery.home.queryOptions());
  const { data: catalog } = useSuspenseQuery(trpc.discovery.catalog.queryOptions());
  const { data: gems } = useSuspenseQuery(trpc.discovery.forgottenGems.queryOptions());
  const { data: unused } = useSuspenseQuery(trpc.discovery.unusedCharacters.queryOptions());
  const { data: routing } = useSuspenseQuery(trpc.discovery.modelRouting.queryOptions());
  const [theme, setTheme] = useState<ThemeSelection | null>(null);

  // FIRST RUN: every analysis plane on this surface is fed by the same two jobs, so when they have never run
  // the five analysis sections have nothing but seven muted "No … computed yet." notes between them. Collapse
  // them into ONE state that names the jobs and opens the door (side-eye 2026-08-08 P1-2). The read is the
  // two ALREADY-SUSPENDED queries — themes at both levels and the distilled catalog — never a probe query:
  // keywords and theme drift derive from the same distillation, so a separate read could only agree.
  const analysed = home.topSceneThemes.length > 0 || home.topArcThemes.length > 0 || catalog.totalDistilled > 0;

  return (
    <Stack gap="section">
      {/* COVERAGE SHOWS WHAT IT COVERS (#99 item 7 — the null state should look null). Before the two jobs
          have ever run, five of these six figures are structurally zero, and the strip rendered them at
          DISPLAY size directly above "Nothing analyzed yet" — a confident wall of numbers saying, loudly,
          nothing, immediately above the sentence that already says it. Unanalysed, the strip prints the one
          figure that IS a real count (the library itself) and lets the empty state below carry the rest.
          It is not a general hide-zeros rule: once anything has been analysed every figure prints, zero
          included, because THEN a zero is a measurement. */}
      <Section heading="Coverage">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Characters" value={home.coverage.characters.toString()} />
          {analysed ? (
            <>
              <StatFigure label="Digests" value={home.coverage.digests.toString()} />
              <StatFigure label="Segments" value={home.coverage.segments.toString()} />
              <StatFigure label="Distilled" value={catalog.totalDistilled.toString()} />
              <StatFigure label="Duplicate characters" value={home.duplicateCounts.characters.toString()} />
              <StatFigure label="Duplicate chats" value={home.duplicateCounts.chats.toString()} />
            </>
          ) : null}
        </Row>
      </Section>

      {analysed ? (
        <>
          <Section heading="Themes">
            <Stack gap="block">
              <ThemeGroup label="Scenes" themes={home.topSceneThemes} selected={theme} onSelect={setTheme} />
              <ThemeGroup label="Arcs" themes={home.topArcThemes} selected={theme} onSelect={setTheme} />
              {theme !== null ? <ThemeDetailCard selection={theme} onDismiss={(): void => setTheme(null)} /> : null}
            </Stack>
          </Section>

          <AllThemes />

          <KeywordExplorer />

          <Section heading="Catalog">
            <Stack gap="block">
              <FacetBars label="Genres" facets={catalog.genres} />
              <FacetBars label="Tones" facets={catalog.tones} />
              {catalog.topTags.length === 0 ? (
                <Text voice="gloss">No tags distilled.</Text>
              ) : (
                <BarList
                  label="Top tags"
                  items={toBarItems(
                    catalog.topTags,
                    (tag) => tag.tag,
                    (tag) => tag.count,
                  )}
                />
              )}
            </Stack>
          </Section>
        </>
      ) : (
        <CorpusRunJobEmptyState title="Nothing analyzed yet" description="Run Distill characters and Compute themes to fill this in." />
      )}

      <Section heading="Forgotten gems">
        {gems.length === 0 ? (
          <Text voice="gloss">No quiet-but-invested characters yet.</Text>
        ) : (
          <Stack aria-label="Forgotten gems" gap="row" role="list">
            {gems.map((gem) => (
              <Row key={gem.characterId} role="listitem">
                <ListRow
                  clickable={true}
                  onClick={(): void => selectCorpusCharacter(gem.characterId)}
                  leading={<CharacterAvatar id={gem.characterId} name={gem.name} hash={gem.avatarHash} />}
                  title={gem.name}
                  // A LIFETIME AGGREGATE, said as one (#99 item 7): the bare "Hikari · 1599 messages" was
                  // anatomically a chat row, and read as one — the largest real chat on this instance is
                  // 71 messages, so the number looked like a bug rather than a career total. "in total"
                  // is the whole fix; the row is per-CHARACTER and now says so.
                  // The stamp is the COMPACT form, the same column-scan shape the chats list uses (#99
                  // item 4) — six rows of "last active about three weeks ago" is six wasted clauses.
                  subtitle={`${gem.messageCount} messages in total · ${gem.tokensOut.toString()} tokens · last active ${timeLib.formatRelativeCompact(gem.lastActiveAt)}`}
                  actions={<Money value={gem.costUsd} />}
                />
              </Row>
            ))}
          </Stack>
        )}
      </Section>

      <Section heading="Never played">
        {unused.length === 0 ? (
          <Text voice="gloss">Every character has been played at least once.</Text>
        ) : (
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
                onClick={(): void => selectCorpusCharacter(character.characterId)}
                leading={<CharacterAvatar id={character.characterId} name={character.name} hash={character.avatarHash} />}
                title={character.name}
                subtitle="Collected but never played"
              />
            )}
          />
        )}
      </Section>

      <Section heading="Model economics">
        {routing.length === 0 ? (
          <Text voice="gloss">No generation economics recorded yet.</Text>
        ) : (
          <BarList
            label="Cost by route"
            valueFormatter={money}
            items={toBarItems(
              routing,
              (route) => `${route.genre} → ${modelDisplayName(route.model)}`,
              (route) => route.costUsd,
            )}
          />
        )}
      </Section>

      {analysed ? <ThemeDrift /> : null}
    </Stack>
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
}): ReactElement {
  return (
    <Stack gap="field">
      <Text voice="kicker">{label}</Text>
      {themes.length === 0 ? (
        <Text voice="gloss">No {label.toLowerCase()} themes computed yet.</Text>
      ) : (
        <Stack aria-label={`${label} themes`} gap="row" role="list">
          {themes.map((row) => (
            <Row key={row.id} role="listitem">
              <ListRow
                clickable={true}
                selected={selected !== null && selected.clusterIdx === row.clusterIdx && selected.level === row.level}
                onClick={(): void => onSelect({ clusterIdx: row.clusterIdx, level: row.level })}
                title={row.name ?? "Unnamed theme"}
                subtitle={`${row.size} digests`}
              />
            </Row>
          ))}
        </Stack>
      )}
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
        <ThemeDetailBody selection={selection} onDismiss={onDismiss} />
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
        <Text>This theme is no longer available.</Text>
        <Button intent="ghost" size="sm" onClick={onDismiss}>
          Close
        </Button>
      </Row>
    );
  }
  return (
    <Stack gap="block">
      <Row align="center" justify="between">
        <Text className="font-semibold">{detail.name ?? "Unnamed theme"}</Text>
        <Button intent="ghost" size="sm" onClick={onDismiss}>
          Close
        </Button>
      </Row>
      <Text voice="gloss">
        {detail.size} digests · {detail.level}
      </Text>
      <Stack gap="row" role="list">
        {detail.members.map((member) => (
          <ListRow
            key={member.characterId}
            clickable={true}
            onClick={(): void => selectCorpusCharacter(member.characterId)}
            title={member.name}
            subtitle={`${member.count} digests in this theme`}
          />
        ))}
      </Stack>
    </Stack>
  );
}

/** A spend readout — and NOTHING at zero (#99 item 7). On a local-model instance every row's cost is
 *  genuinely $0.00, so the column rendered six identical zeros: a data column that never varies is not a
 *  column, it is decoration that costs the row's whole trailing zone. Absent means "this cost nothing",
 *  which is what the row is already saying; a real spend still prints, so the column appears exactly when
 *  it has something to say. */
function Money({ value }: { readonly value: number }): ReactElement | null {
  if (value === 0) {
    return null;
  }
  return (
    <Text voice="gloss" className="whitespace-nowrap font-mono">
      {money(value)}
    </Text>
  );
}
