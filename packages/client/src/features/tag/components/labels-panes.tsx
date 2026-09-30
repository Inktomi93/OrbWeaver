// The Corpus Labels panes around the finder (D271): the LIST band, the CONTENT body, and the CONTEXT band and
// tab. CONTENT shows the tag library, or the open tag's editor; CONTEXT explains labels against generated
// facets, or states the open tag's reach by kind and origin.

import type { TagSource } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader, MemberDrillHeader, QueryBoundary } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import { CORPUS_MODE_LABELS } from "#lib";
import { clearLabelSelection, useSelectedLabelId } from "#state";
import { useCreateLabel, useTagCensus, useTagName } from "../hooks/use-tag-library.ts";
import { USAGE_KIND_TITLES, usageTotalLabel } from "../lib/tags-model.ts";
import { LabelsLibrarySurface } from "../surfaces/labels-library-surface.tsx";
import { TagMemberSurface } from "../surfaces/tag-member-surface.tsx";

/** The LIST band: the mode's name, the library census, and the finder's ONE primary verb. */
export function LabelsListHeader(): ReactElement {
  const count = useTagCensus();
  const create = useCreateLabel();
  return (
    <ListPaneHeader
      action={
        <Button intent="primary" onClick={create} size="sm" type="button">
          <Icon icon={Plus} size="sm" />
          New tag
        </Button>
      }
      count={count ?? 0}
      title={CORPUS_MODE_LABELS.labels}
    />
  );
}

/** CONTENT: the region owns the scroll and the inset once, for both surfaces (the `corpus-content.tsx`
 *  precedent). The editor suspends on the library read, so its Back is the boundary's fallback too: the exit
 *  is never missing for the beat the reader most wants it (#1747). Keyed per tag, so the editor's local
 *  name draft never carries over to the next tag. */
export function LabelsContent(): ReactElement {
  const tagId = useSelectedLabelId();
  const exit = <MemberDrillHeader back={{ label: `Back to ${CORPUS_MODE_LABELS.labels}`, onClick: clearLabelSelection }} />;
  return (
    <Container className="h-full min-h-0">
      <Stack className="relative h-full min-h-0 overflow-y-auto overscroll-contain" data-slot="labels-content" padding="section">
        {tagId === null ? (
          <LabelsLibrarySurface />
        ) : (
          <QueryBoundary
            fallback={exit}
            renderError={(_error, retry): ReactElement => (
              <Stack gap="block">
                {exit}
                <QueryErrorState label="this tag" onRetry={retry} />
              </Stack>
            )}
          >
            <TagMemberSurface key={tagId} tagId={tagId} />
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
    <Text className="truncate" voice="label">
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
        A label is yours: you create it, attach it, and it stays until you remove it.
      </Text>
      <Text prose={true} voice="gloss">
        Genres, tones, themes, families and archetypes come from corpus analysis. They are generated facets, not labels, and they can change when the analysis
        reruns.
      </Text>
    </Stack>
  );
}

function TagReach({ tagId }: { readonly tagId: TagId }): ReactElement {
  const trpc = useTRPC();
  const tag = useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data?.find((row) => row.id === tagId);
  if (tag === undefined) {
    return <Skeleton className="h-16 w-full" />;
  }
  const kinds = Object.keys(USAGE_KIND_TITLES) as (keyof typeof USAGE_KIND_TITLES)[];
  return (
    <Stack data-slot="label-reach" gap="block">
      <Text voice="kicker">{usageTotalLabel(tag.usage.total)}</Text>
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
      <Text voice="gloss">{tag.source === null ? "Origin not recorded" : SOURCE_LABELS[tag.source]}</Text>
    </Stack>
  );
}
