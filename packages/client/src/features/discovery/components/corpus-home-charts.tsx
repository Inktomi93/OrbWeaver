// The Corpus overview's ANALYSIS SUB-SECTIONS — split out of corpus-home-surface so the surface stays under
// the god-component cap. All chart-family (bar-list) adoptions of count data plus the drills the overview
// hosts: browse-all story themes (`themes`, scene↔arc), the keyword explorer (`topKeywords` →
// `cooccurringKeywords`), story-time theme drift (`themeDrift`, scene↔arc), and the catalog facet bars.
// Each level/keyword switch is a plain refetching query (no whole-overview re-suspend).
//
// EVERY BLOCK HERE RENDERS NOTHING WHEN IT HAS NOTHING (program #102 corpus leg, issue #127). It used to
// render its `<Section>` band plus a muted "No … computed yet." line, which is how an un-analysed library
// produced seven true sentences saying nothing down one pane. The single place that reports what has not
// run is now the READINESS RAIL on the overview, once, with each pass's real completeness beside it — so a
// block with no data is simply absent, and the absence is already explained above it. A `null` return is
// therefore the DESIGN, not a missing empty state.
//
// "STORY THEMES", never a bare "themes": the discovery domain's distillation output shares a word with the
// app's colour themes and the owner has been caught by that once. The `level` axis vocabulary
// (scene / arc) is unchanged — it is the domain's own.

import { Badge } from "@orb/ui/badge";
import { BarList } from "@orb/ui/bar-list";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { toBarItems } from "../lib/corpus-charts.ts";
import { ParamSelect, ParamToggle } from "./corpus-controls.tsx";

type ThemeLevel = "scene" | "arc";
type CorpusCatalog = inferOutput<Trpc["discovery"]["catalog"]>;

const NO_KEYWORD = "";
const SKELETON_ROW_COUNT = 3;
const LEVEL_OPTIONS = [
  { value: "scene", label: "Scenes" },
  { value: "arc", label: "Arcs" },
] as const;

/** Browse every story theme — a scene↔arc toggle over `themes`, each theme's digest size charted. */
export function AllStoryThemes(): ReactElement {
  const [level, setLevel] = useState<ThemeLevel>("scene");
  // The BAND is inside the body: at zero the whole block — heading, toggle and all — has to disappear, and
  // a toggle over an empty set is a control with nothing to switch between.
  return <ThemeSizeBars level={level} onLevelChange={setLevel} />;
}

function ThemeSizeBars({ level, onLevelChange }: { readonly level: ThemeLevel; readonly onLevelChange: (next: ThemeLevel) => void }): ReactElement | null {
  const trpc = useTRPC();
  const themes = useQuery(trpc.discovery.themes.queryOptions({ level }));

  if (themes.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (themes.error !== null) {
    return <QueryErrorState label="the story themes" onRetry={themes.refetch} />;
  }
  if (themes.data.length === 0) {
    return null;
  }
  return (
    <Section kicker="All story themes" level={2}>
      <Stack data-testid={testId("corpusThemesDrill")} gap="block">
        <ParamToggle label="Level" onValueChange={(next): void => onLevelChange(next as ThemeLevel)} options={LEVEL_OPTIONS} value={level} />
        <BarList
          items={toBarItems(
            themes.data,
            (row) => row.name ?? "Unnamed theme",
            (row) => row.size,
          )}
          label="Story theme sizes"
        />
      </Stack>
    </Section>
  );
}

/** The keyword explorer — `topKeywords` as a bar-list, and picking one drills its `cooccurringKeywords`. */
export function KeywordExplorer(): ReactElement | null {
  const trpc = useTRPC();
  const { data: top } = useSuspenseQuery(trpc.discovery.topKeywords.queryOptions());
  const [keyword, setKeyword] = useState(NO_KEYWORD);

  if (top.length === 0) {
    return null;
  }

  const items: SelectItems<string> = [
    { value: NO_KEYWORD, label: "Explore a keyword…" },
    ...top.map((row) => ({ value: row.keyword, label: `${row.keyword} (${row.count})` })),
  ];

  return (
    <Section kicker="Keywords" level={2}>
      <Stack data-testid={testId("corpusKeywordExplorer")} gap="block">
        <BarList
          items={toBarItems(
            top,
            (row) => row.keyword,
            (row) => row.count,
          )}
          label="Top keywords"
        />
        <ParamSelect items={items} label="Cooccurs with" onValueChange={setKeyword} value={keyword} />
        {keyword === NO_KEYWORD ? null : <CooccurringKeywords keyword={keyword} />}
      </Stack>
    </Section>
  );
}

function CooccurringKeywords({ keyword }: { readonly keyword: string }): ReactElement | null {
  const trpc = useTRPC();
  const cooccurring = useQuery(trpc.discovery.cooccurringKeywords.queryOptions({ keyword }));

  if (cooccurring.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (cooccurring.error !== null) {
    return <QueryErrorState label="the cooccurrences" onRetry={cooccurring.refetch} />;
  }
  if (cooccurring.data.length === 0) {
    // The ONE surviving note in this file, and it earns its place: the user PICKED this keyword, so an
    // empty result is an answer to a question they just asked, not an un-run pass.
    return <Text voice="gloss">Nothing co-occurs with “{keyword}” yet.</Text>;
  }
  return (
    <BarList
      items={toBarItems(
        cooccurring.data,
        (row) => row.keyword,
        (row) => row.count,
      )}
      label={`Co-occurs with ${keyword}`}
    />
  );
}

/** Story-time theme prevalence, scene↔arc toggle. A plain query so the level switch refetches in place. */
export function StoryThemeDrift(): ReactElement {
  const [level, setLevel] = useState<ThemeLevel>("scene");
  return <StoryThemeDriftBody level={level} onLevelChange={setLevel} />;
}

function StoryThemeDriftBody({
  level,
  onLevelChange,
}: {
  readonly level: ThemeLevel;
  readonly onLevelChange: (next: ThemeLevel) => void;
}): ReactElement | null {
  const trpc = useTRPC();
  const drift = useQuery(trpc.discovery.themeDrift.queryOptions({ level }));

  if (drift.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (drift.error !== null) {
    return <QueryErrorState label="story-theme drift" onRetry={drift.refetch} />;
  }
  if (drift.data.length === 0) {
    return null;
  }
  return (
    <Section kicker="Story-theme drift" level={2}>
      <Stack gap="block">
        <ParamToggle label="Level" onValueChange={(next): void => onLevelChange(next as ThemeLevel)} options={LEVEL_OPTIONS} value={level} />
        <Stack gap="row">
          {drift.data.map((bucket) => (
            <Row align="center" className="flex-wrap" gap="field" key={bucket.bucket}>
              <Text voice="kicker">{bucket.bucket}</Text>
              {bucket.themes.map((t) => (
                <Badge intent="neutral" key={t.clusterIdx} size="sm">
                  {t.themeName ?? "Unnamed"} ({t.count})
                </Badge>
              ))}
            </Row>
          ))}
        </Stack>
      </Stack>
    </Section>
  );
}

/** The distilled catalog's facet distributions — genres, tones, top tags — each as a bar-list. */
export function CatalogFacets({ catalog }: { readonly catalog: CorpusCatalog }): ReactElement | null {
  const blocks = [
    { id: "genres", label: "Genres", facets: catalog.genres },
    { id: "tones", label: "Tones", facets: catalog.tones },
  ].filter((block) => block.facets.length > 0);

  if (blocks.length === 0 && catalog.topTags.length === 0) {
    return null;
  }
  return (
    <Section kicker="Catalog" level={2}>
      {blocks.map((block) => (
        <BarList
          items={toBarItems(
            block.facets,
            (facet) => facet.value,
            (facet) => facet.count,
          )}
          key={block.id}
          label={block.label}
        />
      ))}
      {catalog.topTags.length === 0 ? null : (
        <BarList
          items={toBarItems(
            catalog.topTags,
            (tag) => tag.tag,
            (tag) => tag.count,
          )}
          label="Top tags"
        />
      )}
    </Section>
  );
}
