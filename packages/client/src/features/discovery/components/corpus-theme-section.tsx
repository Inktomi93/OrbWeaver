// Story-theme doors retain producer row identity before opening CONTENT.

import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { selectCorpusArtifact, useSelectedCorpusDestination } from "#state";

type ThemeRow = inferOutput<Trpc["discovery"]["home"]>["sceneThemes"][number];

export function CorpusThemeSection({
  sceneThemes,
  arcThemes,
}: {
  readonly sceneThemes: readonly ThemeRow[];
  readonly arcThemes: readonly ThemeRow[];
}): ReactElement | null {
  const selection = useSelectedCorpusDestination();
  if (sceneThemes.length === 0 && arcThemes.length === 0) {
    return null;
  }
  return (
    <Section kicker="Story themes" level={2}>
      {[
        { label: "Scenes", rows: sceneThemes },
        { label: "Arcs", rows: arcThemes },
      ]
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <Stack key={group.label} gap="field">
            <Text voice="kicker">{group.label}</Text>
            <Stack aria-label={`${group.label} story themes`} gap="row" role="list">
              {group.rows.map((row) => (
                <Stack key={row.id} role="listitem">
                  <ListRow
                    clickable={true}
                    onClick={(): void => selectCorpusArtifact({ kind: "theme", row })}
                    selected={selection?.kind === "theme" && selection.row.id === row.id}
                    title={row.name ?? "Unnamed theme"}
                    subtitle={`${row.size} digests`}
                  />
                </Stack>
              ))}
            </Stack>
          </Stack>
        ))}
    </Section>
  );
}
