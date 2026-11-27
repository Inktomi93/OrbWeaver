// The lightbox's provenance detail strip — `imagery.readProvenance`
// over the viewed asset. Owner-scoped by construction (the verb joins through `assets.ownerId`); a stranger
// or a non-generated image reads `null`, which is a first-class DATA state ("no details"), never an error.
// The three honest arms: pending → skeleton, error → the shared retryable block, null/loaded → the strip.
// The read suspends under its own boundary so the modal's image paints immediately and the strip fills in.

import type { AssetId, CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import { IMAGE_MODE_LABELS, timeLib } from "#lib";
// One cost voice for the whole feature (#623) — the imagine modal's read receipt writes a spend the same way.
import { formatCost } from "../lib/format-cost.ts";
import {
  IMAGE_PROVENANCE_EMPTY_TEXT,
  IMAGE_PROVENANCE_NEGATIVE_LABEL,
  IMAGE_PROVENANCE_READ_LABEL,
  IMAGE_PROVENANCE_SUBJECT_GONE,
} from "../lib/imagine-names.ts";
import { provenanceUsageLabels } from "../lib/provenance-usage.ts";

export function ProvenanceStrip({ assetId }: { readonly assetId: AssetId }): ReactElement {
  return (
    <QueryBoundary
      resetKeys={[assetId]}
      fallback={<SkeletonRows count={2} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label={IMAGE_PROVENANCE_READ_LABEL} onRetry={retry} />}
    >
      <LoadedProvenance assetId={assetId} />
    </QueryBoundary>
  );
}

function LoadedProvenance({ assetId }: { readonly assetId: AssetId }): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.imagery.readProvenance.queryOptions({ assetId }));
  if (data === null) {
    return (
      <Text voice="gloss" data-slot="provenance-empty">
        {IMAGE_PROVENANCE_EMPTY_TEXT}
      </Text>
    );
  }

  const usage = provenanceUsageLabels(data.usage);
  return (
    <Stack gap="field" data-slot="provenance">
      <Text voice="reading" data-slot="provenance-prompt">
        {data.prompt}
      </Text>
      {data.negativePrompt === null || data.negativePrompt.length === 0 ? null : (
        <Text voice="gloss" data-slot="provenance-negative">
          {`${IMAGE_PROVENANCE_NEGATIVE_LABEL}: ${data.negativePrompt}`}
        </Text>
      )}
      <Row wrap={true} gap="tight">
        <Badge size="sm">{data.model}</Badge>
        <Badge size="sm">{IMAGE_MODE_LABELS[data.mode]}</Badge>
        {data.edited ? <Badge size="sm">Edited</Badge> : null}
        {data.costUsd === null ? null : <Badge size="sm">{formatCost(data.costUsd)}</Badge>}
        {data.subjectCharacterId === null ? null : <ProvenanceSubject characterId={data.subjectCharacterId} />}
      </Row>
      {usage.length === 0 ? null : (
        <Row wrap={true} gap="tight" data-slot="provenance-usage">
          {usage.map((label) => (
            <Badge key={label} size="sm" variant="outline">
              {label}
            </Badge>
          ))}
        </Row>
      )}
      <Text voice="gloss" data-slot="provenance-created">
        {timeLib.formatRelative(data.createdAt)}
      </Text>
    </Stack>
  );
}

/** The character the picture is of. The name is a separate read, so a slow or failed one never holds the rest of the strip. */
function ProvenanceSubject({ characterId }: { readonly characterId: CharacterId }): ReactElement | null {
  const trpc = useTRPC();
  const { data, isError } = useQuery(trpc.character.get.queryOptions({ characterId }));
  if (isError) {
    return (
      <Badge size="sm" data-slot="provenance-subject">
        {IMAGE_PROVENANCE_SUBJECT_GONE}
      </Badge>
    );
  }
  return data === undefined ? null : (
    <Badge size="sm" data-slot="provenance-subject">
      {data.name}
    </Badge>
  );
}
