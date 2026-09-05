// THE CORPUS OVERVIEW'S STORY-THEME SECTION — the scene/arc theme rows and the detail card one opens.
// Split out of `corpus-home-surface.tsx` (component-size: the surface passed the 450-line hard cap), and
// this is the block that leaves cleanly: its selection state, its row list, and its drill-in card are one
// closed interaction that nothing else on the surface reads.
//
// IT OWNS ITS OWN SELECTION. The surface used to hold `theme` in a `useState` beside seven unrelated
// reads, purely so two of its children could agree on it — the classic reason a surface grows. The state
// moved WITH the thing that uses it; the surface now passes the two theme lists and nothing else.
//
// THE ROWS ARE THE ONLY PLACE A THEME IS MET, and they are COMPLETE rather than a top-8 slice: the "all
// story themes" bar chart was cut in the 2026-08-18 forensics pass (a non-interactive twin of these rows
// 400px below them), so `discovery.home` returns the whole set and these rows carry it.
//
// AN EMPTY SECTION RENDERS NOTHING AT ALL (program #102 corpus leg, issue #127). No "No themes computed
// yet." note, per group or otherwise — the READINESS RAIL on the overview is the surface's single home for
// what has not run, and a block that prints its own zero is a wall built one true sentence at a time.
//
// "STORY THEMES", never a bare "themes": the discovery domain's distillation output shares a word with the
// app's colour themes and the owner has been caught by that once. The `level` axis vocabulary
// (scene / arc) is unchanged — it is the domain's own.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { selectCorpusCharacter } from "#state";

type ThemeLevel = "scene" | "arc";
type ThemeRow = inferOutput<Trpc["discovery"]["home"]>["sceneThemes"][number];

interface ThemeSelection {
  readonly clusterIdx: number;
  readonly level: ThemeLevel;
}

/** The overview's story-theme block: scene rows, arc rows, and the detail card the picked row opens.
 *  Renders NOTHING when the semantic pass has produced no themes — see the header. */
export function CorpusThemeSection({
  sceneThemes,
  arcThemes,
}: {
  readonly sceneThemes: readonly ThemeRow[];
  readonly arcThemes: readonly ThemeRow[];
}): ReactElement | null {
  const [theme, setTheme] = useState<ThemeSelection | null>(null);
  if (sceneThemes.length === 0 && arcThemes.length === 0) {
    return null;
  }
  return (
    <Section kicker="Story themes" level={2}>
      <ThemeGroup label="Scenes" onSelect={setTheme} selected={theme} themes={sceneThemes} />
      <ThemeGroup label="Arcs" onSelect={setTheme} selected={theme} themes={arcThemes} />
      {theme === null ? null : <ThemeDetailCard onDismiss={(): void => setTheme(null)} selection={theme} />}
    </Section>
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
      {/* RESERVED (#1098). This Card is a drill-in that re-suspends on every theme you pick, and it sits in
          a scrolling column with the rest of the section under it — so each pick collapsed the card to a
          sentence and shoved the content below up and back. The detail's anatomy is fixed (title, keyword
          rail, member list), so the box this device measured predicts the next theme well. */}
      <QueryBoundary
        fallback={<SkeletonRows count={4} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the theme" onRetry={retry} />}
        reserveKey="corpus.themeDetail"
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
