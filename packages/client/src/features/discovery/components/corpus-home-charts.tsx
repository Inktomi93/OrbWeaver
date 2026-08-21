// The Corpus overview's ANALYSIS SUB-SECTIONS — split out of corpus-home-surface so the surface stays under
// the god-component cap: the keyword explorer (`topKeywords` → `cooccurringKeywords`) and story-time theme
// drift (`themeDrift`, scene↔arc). Each level/keyword switch is a plain refetching query (no whole-overview
// re-suspend).
//
// TWO BLOCKS LEFT THIS FILE ON 2026-08-18 (corpus forensics R4), and neither is coming back as a chart:
// "All story themes" was a bar list of the same clusters the overview's theme ROWS carry — the rows are
// clickable and the bars were not, so the rows absorbed it and are no longer capped. The "Catalog" facet
// bars (Genres · Tones · Top tags) restated the browse view's own facet SELECTS, counts and all, which
// narrow the list instead of merely describing it. What survives here answers a question nothing else does.
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
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { toBarItems } from "../lib/corpus-charts.ts";
import { ParamSelect, ParamToggle } from "./corpus-controls.tsx";

type ThemeLevel = "scene" | "arc";
type TopKeyword = inferOutput<Trpc["discovery"]["topKeywords"]>[number];

const NO_KEYWORD = "";
const SKELETON_ROW_COUNT = 3;
const LEVEL_OPTIONS = [
  { value: "scene", label: "Scenes" },
  { value: "arc", label: "Arcs" },
] as const;

/** The keyword explorer — `topKeywords` as a bar-list, and picking one drills its `cooccurringKeywords`.
 *  The read itself lives on the overview (one query owns both this block and the readiness rail's keyword
 *  row, #269), so its PENDING state arrives as a prop rather than off a query of its own. */
export function KeywordExplorer({ top, pending }: { readonly top: readonly TopKeyword[] | undefined; readonly pending: boolean }): ReactElement | null {
  const [keyword, setKeyword] = useState(NO_KEYWORD);

  if (pending) {
    // PENDING IS NOT ABSENCE (side-eye 2026-08-21). This returned `null` while the deferred read was in
    // flight and then materialised under the reader's scroll position — while its two siblings in this very
    // file already held their place with SkeletonRows. The `null` return below IS still the design (a block
    // with no data renders nothing, the rail says why); it just isn't the answer to "not yet".
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="line" />;
  }
  if (top === undefined || top.length === 0) {
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
    // Wrapped, never passed by reference: `onRetry` rides a Button's onClick, so a bare `refetch` receives
    // React's MouseEvent as its options bag (side-eye 2026-08-21).
    return <QueryErrorState label="the cooccurrences" onRetry={(): void => void cooccurring.refetch()} />;
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
    return <QueryErrorState label="story-theme drift" onRetry={(): void => void drift.refetch()} />;
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
