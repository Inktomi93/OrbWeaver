// The Corpus CONTENT overview (nothing selected) — the composed library-understanding home. It reads
// the discovery verbs: `home` (index coverage + top scene/arc themes + near-duplicate counts), `catalog`
// (distilled facet counts + top tags, charted as bar-lists), the `themes` browse-all drill, the keyword
// explorer (`topKeywords` bar-list → `cooccurringKeywords` drill), and four insights — `forgottenGems`
// (invested but quiet), `unusedCharacters` (never played), `modelRouting` (per-genre economics, cost as a
// bar-list), and `themeDrift` (how themes move over story time, scene↔arc toggle). Theme rows drill inline
// into `themeDetail`; a gem / unused row selects that character's dossier into CONTENT.

import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId, timeLib, useFocusOnMount } from "#lib";
import { selectCorpusCharacter } from "#state";
import { CharacterAvatar } from "../components/character-avatar";
import { AllThemes, FacetBars, KeywordExplorer, ThemeDrift } from "../components/corpus-home-charts";
import { toBarItems } from "../lib/corpus-charts";

type ThemeLevel = "scene" | "arc";
type ThemeRow = inferOutput<Trpc["discovery"]["home"]>["topSceneThemes"][number];

const MONEY_PRECISION = 2;

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
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" data-testid={testId("corpusHomeSurface")}>
      <QueryBoundary
        fallback={<Text tone="muted">Loading your corpus…</Text>}
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

  return (
    <Stack className="h-full min-h-0 overflow-y-auto overscroll-contain" gap="section">
      <Section heading="Coverage">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Characters" value={home.coverage.characters.toString()} />
          <StatFigure label="Digests" value={home.coverage.digests.toString()} />
          <StatFigure label="Segments" value={home.coverage.segments.toString()} />
          <StatFigure label="Distilled" value={catalog.totalDistilled.toString()} />
          <StatFigure label="Duplicate characters" value={home.duplicateCounts.characters.toString()} />
          <StatFigure label="Duplicate chats" value={home.duplicateCounts.chats.toString()} />
        </Row>
      </Section>

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
            <Text size="micro" tone="muted">
              No tags distilled.
            </Text>
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

      <Section heading="Forgotten gems">
        {gems.length === 0 ? (
          <Text size="micro" tone="muted">
            No quiet-but-invested characters yet.
          </Text>
        ) : (
          <Stack gap="row" role="list">
            {gems.map((gem) => (
              <ListRow
                key={gem.characterId}
                clickable={true}
                onClick={(): void => selectCorpusCharacter(gem.characterId)}
                leading={<CharacterAvatar id={gem.characterId} name={gem.name} hash={gem.avatarHash} />}
                title={gem.name}
                subtitle={`${gem.messageCount} messages · ${gem.tokensOut.toString()} tokens · last active ${timeLib.formatRelative(gem.lastActiveAt)}`}
                actions={<Money value={gem.costUsd} />}
              />
            ))}
          </Stack>
        )}
      </Section>

      <Section heading="Never played">
        {unused.length === 0 ? (
          <Text size="micro" tone="muted">
            Every character has been played at least once.
          </Text>
        ) : (
          <Stack gap="row" role="list">
            {unused.map((character) => (
              <ListRow
                key={character.characterId}
                clickable={true}
                onClick={(): void => selectCorpusCharacter(character.characterId)}
                leading={<CharacterAvatar id={character.characterId} name={character.name} hash={character.avatarHash} />}
                title={character.name}
                subtitle="Collected but never played"
              />
            ))}
          </Stack>
        )}
      </Section>

      <Section heading="Model economics">
        {routing.length === 0 ? (
          <Text size="micro" tone="muted">
            No generation economics recorded yet.
          </Text>
        ) : (
          <BarList
            label="Cost by route"
            valueFormatter={money}
            items={toBarItems(
              routing,
              (route) => `${route.genre} → ${route.model}`,
              (route) => route.costUsd,
            )}
          />
        )}
      </Section>

      <ThemeDrift />
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
      <Text size="micro" tone="muted" transform="caps">
        {label}
      </Text>
      {themes.length === 0 ? (
        <Text size="micro" tone="muted">
          No {label.toLowerCase()} themes computed yet.
        </Text>
      ) : (
        <Stack gap="row" role="list">
          {themes.map((row) => (
            <ListRow
              key={row.id}
              clickable={true}
              selected={selected !== null && selected.clusterIdx === row.clusterIdx && selected.level === row.level}
              onClick={(): void => onSelect({ clusterIdx: row.clusterIdx, level: row.level })}
              title={row.name ?? "Unnamed theme"}
              subtitle={`${row.size} digests`}
            />
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
        fallback={<Text tone="muted">Loading theme…</Text>}
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
        <Text tone="muted">This theme is no longer available.</Text>
        <Button intent="ghost" size="sm" onClick={onDismiss}>
          Close
        </Button>
      </Row>
    );
  }
  return (
    <Stack gap="block">
      <Row align="center" justify="between">
        <Text weight="semibold">{detail.name ?? "Unnamed theme"}</Text>
        <Button intent="ghost" size="sm" onClick={onDismiss}>
          Close
        </Button>
      </Row>
      <Text size="micro" tone="muted">
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

function Money({ value }: { readonly value: number }): ReactElement {
  return (
    <Text className="whitespace-nowrap font-mono" size="micro" tone="muted">
      {money(value)}
    </Text>
  );
}
