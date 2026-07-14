// The Corpus HOME analytics sub-sections — split out of corpus-home-surface so the surface stays under
// the god-component cap. All chart-family (bar-list) adoptions of count data plus the two capability
// drills the home hosts: the browse-all-themes level toggle (`themes`), the keyword explorer
// (`topKeywords` → `cooccurringKeywords`), the story-time theme drift (`themeDrift`, scene↔arc), and the
// catalog facet bars. Each level/keyword switch is a plain refetching query (no whole-home re-suspend).

import { Badge } from "@orb/ui/badge";
import { BarList } from "@orb/ui/bar-list";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { toBarItems } from "../lib/corpus-charts";
import { ParamSelect, ParamToggle } from "./corpus-controls";

type ThemeLevel = "scene" | "arc";

const NO_KEYWORD = "";
const SKELETON_ROW_COUNT = 3;
const LEVEL_OPTIONS = [
  { value: "scene", label: "Scenes" },
  { value: "arc", label: "Arcs" },
] as const;

/** The browse-all-themes drill — a scene↔arc toggle over `themes`, each theme's digest size charted. */
export function AllThemes(): ReactElement {
  const [level, setLevel] = useState<ThemeLevel>("scene");
  return (
    <Section heading="All themes">
      <Stack gap="block" data-testid={testId("corpusThemesDrill")}>
        <ParamToggle
          label="Level"
          value={level}
          options={LEVEL_OPTIONS}
          onValueChange={(next): void => setLevel(next as ThemeLevel)}
        />
        <ThemeSizeBars level={level} />
      </Stack>
    </Section>
  );
}

function ThemeSizeBars({ level }: { readonly level: ThemeLevel }): ReactElement {
  const trpc = useTRPC();
  const themes = useQuery(trpc.discovery.themes.queryOptions({ level }));

  if (themes.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (themes.error !== null) {
    return <QueryErrorState label="the themes" onRetry={themes.refetch} />;
  }
  if (themes.data.length === 0) {
    return (
      <Text size="micro" tone="muted">
        No {level} themes computed yet.
      </Text>
    );
  }
  return (
    <BarList
      label="Theme sizes"
      items={toBarItems(
        themes.data,
        (row) => row.name ?? "Unnamed theme",
        (row) => row.size,
      )}
    />
  );
}

/** The keyword explorer — `topKeywords` as a bar-list, and picking one drills its `cooccurringKeywords`. */
export function KeywordExplorer(): ReactElement {
  const trpc = useTRPC();
  const { data: top } = useSuspenseQuery(trpc.discovery.topKeywords.queryOptions());
  const [keyword, setKeyword] = useState(NO_KEYWORD);

  const items: SelectItems<string> = [
    { value: NO_KEYWORD, label: "Explore a keyword…" },
    ...top.map((row) => ({ value: row.keyword, label: `${row.keyword} (${row.count})` })),
  ];

  return (
    <Section heading="Keywords">
      {top.length === 0 ? (
        <Text size="micro" tone="muted">
          No keyword cooccurrence computed yet.
        </Text>
      ) : (
        <Stack gap="block" data-testid={testId("corpusKeywordExplorer")}>
          <BarList
            label="Top keywords"
            items={toBarItems(
              top,
              (row) => row.keyword,
              (row) => row.count,
            )}
          />
          <ParamSelect
            label="Cooccurs with"
            value={keyword}
            items={items}
            onValueChange={setKeyword}
          />
          {keyword === NO_KEYWORD ? null : <CooccurringKeywords keyword={keyword} />}
        </Stack>
      )}
    </Section>
  );
}

function CooccurringKeywords({ keyword }: { readonly keyword: string }): ReactElement {
  const trpc = useTRPC();
  const cooccurring = useQuery(trpc.discovery.cooccurringKeywords.queryOptions({ keyword }));

  if (cooccurring.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (cooccurring.error !== null) {
    return <QueryErrorState label="the cooccurrences" onRetry={cooccurring.refetch} />;
  }
  if (cooccurring.data.length === 0) {
    return (
      <Text size="micro" tone="muted">
        Nothing co-occurs with “{keyword}” yet.
      </Text>
    );
  }
  return (
    <BarList
      label={`Co-occurs with ${keyword}`}
      items={toBarItems(
        cooccurring.data,
        (row) => row.keyword,
        (row) => row.count,
      )}
    />
  );
}

/** Story-time theme prevalence, scene↔arc toggle. A plain query so the level switch refetches in place. */
export function ThemeDrift(): ReactElement {
  const [level, setLevel] = useState<ThemeLevel>("scene");
  return (
    <Section heading="Theme drift">
      <Stack gap="block">
        <ParamToggle
          label="Level"
          value={level}
          options={LEVEL_OPTIONS}
          onValueChange={(next): void => setLevel(next as ThemeLevel)}
        />
        <ThemeDriftBody level={level} />
      </Stack>
    </Section>
  );
}

function ThemeDriftBody({ level }: { readonly level: ThemeLevel }): ReactElement {
  const trpc = useTRPC();
  const drift = useQuery(trpc.discovery.themeDrift.queryOptions({ level }));

  if (drift.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (drift.error !== null) {
    return <QueryErrorState label="theme drift" onRetry={drift.refetch} />;
  }
  if (drift.data.length === 0) {
    return (
      <Text size="micro" tone="muted">
        Not enough story-time data to chart theme drift.
      </Text>
    );
  }
  return (
    <Stack gap="row">
      {drift.data.map((bucket) => (
        <Row key={bucket.bucket} align="center" gap="field" className="flex-wrap">
          <Text size="micro" tone="muted" transform="caps">
            {bucket.bucket}
          </Text>
          {bucket.themes.map((t) => (
            <Badge key={t.clusterIdx} intent="neutral" size="sm">
              {t.themeName ?? "Unnamed"} ({t.count})
            </Badge>
          ))}
        </Row>
      ))}
    </Stack>
  );
}

/** A catalog facet distribution as a bar-list (or a muted note when nothing's distilled for it). */
export function FacetBars({
  label,
  facets,
}: {
  readonly label: string;
  readonly facets: readonly { readonly value: string; readonly count: number }[];
}): ReactElement {
  if (facets.length === 0) {
    return (
      <Stack gap="field">
        <Text size="micro" tone="muted" transform="caps">
          {label}
        </Text>
        <Text size="micro" tone="muted">
          None distilled.
        </Text>
      </Stack>
    );
  }
  return (
    <BarList
      label={label}
      items={toBarItems(
        facets,
        (facet) => facet.value,
        (facet) => facet.count,
      )}
    />
  );
}
