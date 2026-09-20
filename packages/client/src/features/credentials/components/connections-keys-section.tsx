// The SAVED KEYS section (Settings → Connections) — the read-only REUSE view of the keys connections mint
// (inference program §5.3a: a credential is a sealed secret with a label; connections give it meaning, so
// there is no "active" key and no add here — a key is pasted on the connection form). Revoke and remove
// stay. The secret is never rendered. Owns its own `QueryBoundary` (config-revamp-design.md §6.8).

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, KeyRound } from "@orb/ui/icons";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { CONNECTIONS_KEYS_SUBCATEGORY } from "../lib/connections-nav.ts";
import { CredentialKeyRow } from "./credential-key-row.tsx";

export function ConnectionsKeysSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into the saved-key library, with every later Connections section stacked under it.
    <QueryBoundary
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your saved keys" onRetry={retry} />}
      reserveKey="config.connections.keys"
    >
      <SavedKeysSection />
    </QueryBoundary>
  );
}

function SavedKeysSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());

  return (
    <Section divider={true} heading={CONNECTIONS_KEYS_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_KEYS_SUBCATEGORY.id)}>
      <Text voice="gloss">
        The keys your connections use. Add one from a connection; here you can revoke or remove it. Keys are encrypted and never shown again.
      </Text>

      {credentials.length === 0 ? (
        <EmptyState icon={<Icon icon={KeyRound} size="lg" />} title="No keys yet" description="A key is saved when you add a connection that needs one." />
      ) : (
        <Stack gap="field">
          {credentials.map((credential) => (
            <CredentialKeyRow
              key={credential.id}
              credential={credential}
              usedBy={connections.filter((connection) => connection.credentialId === credential.id).length}
              trpc={trpc}
              invalidation={invalidation}
            />
          ))}
        </Stack>
      )}
    </Section>
  );
}
