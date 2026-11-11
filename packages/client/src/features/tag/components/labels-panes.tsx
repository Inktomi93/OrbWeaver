// The Corpus Labels panes around the finder (D271): the LIST band, the CONTENT body, and the CONTEXT band and
// tab. CONTENT shows the tag library, or the open tag's editor; CONTEXT explains labels against generated
// facets, or states the open tag's reach by kind and origin.

import type { TagSource } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { DetailHeader, QueryBoundary, returnFocusToRow } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import type { DrillBack } from "#lib";
import { CORPUS_MODE_LABELS, DIALOG_VERBS, sectionBackName, tagUsageLabel, USAGE_KIND_TITLES } from "#lib";
import { clearLabelSelection, useSelectedLabelId } from "#state";
import { useTagName } from "../hooks/use-tag-library.ts";
import type { LabelsLandingReturn } from "../surfaces/labels-landing-surface.tsx";
import { LabelsLandingSurface } from "../surfaces/labels-landing-surface.tsx";
import { TagMemberSurface } from "../surfaces/tag-member-surface.tsx";
import { LabelAttachedEntities } from "./label-attached-entities.tsx";

/** How the library comes back: on a cold arrival, after an editor closed by merge or delete, or after a Back that focused a row. */
function landingReturn(editorWasOpen: boolean, backToRow: boolean): LabelsLandingReturn | null {
  if (!editorWasOpen) {
    return null;
  }
  return backToRow ? "row" : "library";
}

/** CONTENT: the region owns the scroll and the inset once, for both surfaces (the `corpus-content.tsx`
 *  precedent). The editor suspends on the library read, so its Back is the boundary's fallback too: the exit
 *  is never missing for the beat the reader most wants it. Keyed per tag, so the editor's local
 *  name draft never carries over to the next tag. */
export function LabelsContent(): ReactElement {
  const tagId = useSelectedLabelId();
  // Once an editor has been open, the library only ever returns by closing it (Back, merge, delete).
  const [editorWasOpen, setEditorWasOpen] = useState(tagId !== null);
  // A Back hands focus to the finder row the tag was opened from, so the library it returns to stands down; a finder that
  // cannot take focus (collapsed, or a released overlay) declines, and the library keeps the landing.
  const [backToRow, setBackToRow] = useState(false);
  // Reset on the open itself: the Back's own render still carries the tag, and must keep the flag it just set.
  const [shownTagId, setShownTagId] = useState(tagId);
  if (tagId !== shownTagId) {
    setShownTagId(tagId);
    if (tagId !== null) {
      setEditorWasOpen(true);
      setBackToRow(false);
    }
  }
  const back: DrillBack = {
    label: sectionBackName(CORPUS_MODE_LABELS.labels),
    onClick: (): void => {
      setBackToRow(tagId !== null && returnFocusToRow(tagId));
      clearLabelSelection();
    },
  };
  const exit = <DetailHeader back={back} />;
  return (
    <Container className="min-block-0" height="fill">
      <Stack scroll="y" height="fill" paddingBlock="section" data-slot="labels-content">
        {tagId === null ? (
          <LabelsLandingSurface returning={landingReturn(editorWasOpen, backToRow)} />
        ) : (
          <QueryBoundary
            resetKeys={[tagId]}
            fallback={exit}
            renderError={(_error, retry): ReactElement => (
              <QueryErrorState
                label="this tag"
                onRetry={retry}
                renderRetry={(refetch): ReactElement => (
                  <Stack gap="block">
                    {exit}
                    <Button variant="ghost" onClick={refetch}>
                      {DIALOG_VERBS.retry}
                    </Button>
                  </Stack>
                )}
              />
            )}
          >
            <TagMemberSurface back={back} key={tagId} tagId={tagId} />
          </QueryBoundary>
        )}
      </Stack>
    </Container>
  );
}

/** The CONTEXT band: the open tag's name, else the mode's name. */
export function LabelsContextHeader(): ReactElement {
  const tagId = useSelectedLabelId();
  const name = useTagName(tagId);
  return (
    <Text truncate={true} voice="label">
      {tagId === null ? CORPUS_MODE_LABELS.labels : (name ?? "Tag")}
    </Text>
  );
}

const SOURCE_LABELS: Readonly<Record<TagSource, string>> = {
  manual: "You created it",
  auto: "Suggested by corpus analysis",
  card: "Adopted from a character card",
};

/** The Labels CONTEXT tab body. */
export function LabelsContextTab(): ReactElement {
  const tagId = useSelectedLabelId();
  return tagId === null ? <LabelsMeaning /> : <TagReach tagId={tagId} />;
}

function LabelsMeaning(): ReactElement {
  return (
    <Stack data-slot="labels-meaning" gap="block">
      <Text prose={true} voice="gloss">
        A tag is yours: you create it, attach it, and it stays until you remove it.
      </Text>
      <Text prose={true} voice="gloss">
        Genres, tones, themes, families and archetypes come from corpus analysis. They are generated facets, not tags, and they can change when the analysis
        reruns.
      </Text>
    </Stack>
  );
}

function TagReach({ tagId }: { readonly tagId: TagId }): ReactElement {
  const trpc = useTRPC();
  const tag = useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data?.find((row) => row.id === tagId);
  if (tag === undefined) {
    return <Skeleton width="full" height="row" />;
  }
  const kinds = Object.keys(USAGE_KIND_TITLES) as (keyof typeof USAGE_KIND_TITLES)[];
  return (
    <Stack data-slot="label-reach" gap="block">
      <Text voice="kicker">{tagUsageLabel(tag)}</Text>
      <Stack gap="field">
        {kinds.map((kind) => (
          <Row align="center" gap="field" justify="between" key={kind}>
            <Text as="span">{USAGE_KIND_TITLES[kind]}</Text>
            <Text as="span" voice="datum">
              {String(tag.usage[kind])}
            </Text>
          </Row>
        ))}
      </Stack>
      <LabelAttachedEntities tagId={tagId} />
      <Text voice="gloss">{tag.source === null ? "Origin not recorded" : SOURCE_LABELS[tag.source]}</Text>
    </Stack>
  );
}
