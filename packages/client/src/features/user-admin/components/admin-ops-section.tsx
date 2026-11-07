// Admin ops bodies (Settings → Admin) over the built connection/admin verbs: the OpenRouter model-catalog
// refresher (`GET /models`, admin-gated — the agent-sdk daemon list is warmed under each user's own
// `claude-sub` row, inference program §4) and the inline single-card embed. Both are adminProcedure server-side — this pane is UX honesty over that
// floor. The embed has no natural character-ops home in the admin surface, so it takes a raw character id
// (an admin diagnostic utility, not an end-user flow).

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useEmbedCharacterCard, useRefreshCatalog } from "../hooks/use-admin-mutations.ts";
import { ADMIN_CATALOG_SUBCATEGORY, ADMIN_EMBEDDINGS_SUBCATEGORY } from "../lib/admin-ops-nav.ts";

/** The one built-in row with an enriched hosted catalog (reasoning/modality/pricing fields). */
const OPENROUTER_PROVIDER_ID = "openrouter";

/** The OpenRouter catalog refresher — re-fetches the enriched list every OpenRouter connection's picker browses. */
export function AdminCatalogSection({ anchorId }: { readonly anchorId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const refreshCatalog = useRefreshCatalog({ trpc, invalidation });

  return (
    <Section container={true} divider={true} heading={ADMIN_CATALOG_SUBCATEGORY.label} id={anchorId}>
      <Stack gap="row">
        <Text voice="gloss">Re-fetch the OpenRouter model catalog every OpenRouter connection browses. Runs live against the provider.</Text>
        <Row gap="field" align="center" wrap={true}>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshCatalog.isPending}
            onClick={(): void => refreshCatalog.mutate({ providerId: OPENROUTER_PROVIDER_ID })}
          >
            Refresh OpenRouter catalog
          </Button>
        </Row>
      </Stack>
    </Section>
  );
}

/** Inline single-card embed — embed one character card into the vector index by its id. */
export function AdminEmbedCardSection({ anchorId }: { readonly anchorId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const embed = useEmbedCharacterCard({ trpc, invalidation });
  const [characterId, setCharacterId] = useState("");
  const [done, setDone] = useState(false);
  const hintId = useId();
  const trimmed = characterId.trim();
  // An empty or malformed id names no character, so the button stays disabled; a typed one that does not parse says why.
  const parsed = typeIdSchema(ID_PREFIX.character).safeParse(trimmed).data;
  const malformed = parsed === undefined && trimmed !== "";

  const onEmbed = (): void => {
    if (parsed === undefined) {
      return;
    }
    setDone(false);
    void embed
      .mutateAsync({ characterId: parsed })
      .then(() => setDone(true))
      .catch(() => setDone(false));
  };

  return (
    <Section container={true} divider={true} heading={ADMIN_EMBEDDINGS_SUBCATEGORY.label} id={anchorId}>
      <Stack gap="row">
        <Text voice="gloss">Embed one character card into the vector index by its id (the inline path; the bulk path is the background index job).</Text>
        <Row gap="field" align="center" wrap={true}>
          <Input
            aria-label="Character id"
            placeholder="character id"
            value={characterId}
            onValueChange={(next): void => {
              setCharacterId(next);
              setDone(false);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={parsed === undefined || embed.isPending}
            aria-describedby={malformed ? hintId : undefined}
            onClick={onEmbed}
          >
            Embed card
          </Button>
        </Row>
        {malformed ? (
          <Text tone="destructive" id={hintId} voice="gloss">
            {`That is not a character id. A character id starts with "${ID_PREFIX.character}_".`}
          </Text>
        ) : null}
        {done ? (
          <Text voice="gloss" role="status">
            Card embedded.
          </Text>
        ) : null}
      </Stack>
    </Section>
  );
}
