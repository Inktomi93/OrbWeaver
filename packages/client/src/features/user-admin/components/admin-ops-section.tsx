// Admin ops bodies (Settings → Admin) over the built connection/admin verbs: the two model-catalog
// refreshers (OpenRouter `/models` + the agent-SDK `supportedModels()`, both admin-gated) and the PD-90
// inline single-card embed. All three are adminProcedure server-side — this pane is UX honesty over that
// floor. The embed has no natural character-ops home in the admin surface, so it takes a raw character id
// (an admin diagnostic utility, not an end-user flow).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useEmbedCharacterCard, useRefreshAgentSdkCatalog, useRefreshCatalog } from "../hooks/use-admin-mutations";

/** The two model-catalog refreshers — re-fetch the catalogs the role pickers browse. */
export function AdminCatalogSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const refreshCatalog = useRefreshCatalog({ trpc, invalidation });
  const refreshAgentSdk = useRefreshAgentSdkCatalog({ trpc, invalidation });

  return (
    <Stack gap="row">
      <Text size="micro" tone="muted">
        Re-fetch the model catalogs the role pickers browse. Each runs live against its provider.
      </Text>
      <Row gap="field" align="center" className="flex-wrap">
        <Button intent="secondary" size="sm" disabled={refreshCatalog.isPending} onClick={(): void => refreshCatalog.mutate()}>
          Refresh model catalog
        </Button>
        <Button intent="secondary" size="sm" disabled={refreshAgentSdk.isPending} onClick={(): void => refreshAgentSdk.mutate()}>
          Refresh agent-SDK catalog
        </Button>
      </Row>
    </Stack>
  );
}

/** PD-90 inline single-card embed — embed one character card into the vector index by its id. */
export function AdminEmbedCardSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const embed = useEmbedCharacterCard({ trpc, invalidation });
  const [characterId, setCharacterId] = useState("");
  const [done, setDone] = useState(false);
  const trimmed = characterId.trim();

  const onEmbed = (): void => {
    if (trimmed === "") {
      return;
    }
    setDone(false);
    void embed
      .mutateAsync({ characterId: castId<CharacterId>(trimmed) })
      .then(() => setDone(true))
      .catch(() => setDone(false));
  };

  return (
    <Stack gap="row">
      <Text size="micro" tone="muted">
        Embed one character card into the vector index by its id (the inline path; the bulk path is the background index workload).
      </Text>
      <Row gap="field" align="center" className="flex-wrap">
        <Input
          aria-label="Character id"
          placeholder="character id"
          value={characterId}
          onValueChange={(next): void => {
            setCharacterId(next);
            setDone(false);
          }}
        />
        <Button intent="secondary" size="sm" disabled={trimmed === "" || embed.isPending} onClick={onEmbed}>
          Embed card
        </Button>
      </Row>
      {done ? (
        <Text size="micro" tone="muted" role="status">
          Card embedded.
        </Text>
      ) : null}
    </Stack>
  );
}
