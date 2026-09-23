// The SAVED KEYS section (Settings → Connections) — the REUSE view of the keys connections mint (inference
// program §5.3a: a credential is a sealed secret with a label; connections give it meaning, so there is no
// "active" key and no add here — a key is pasted on the connection form). The secret is never rendered.
// Owns its own `QueryBoundary` (config-revamp-design.md §6.8).
//
// IT IS READ-ONLY ABOUT THE KEY'S VALUE, NOT ABOUT THE ROW — the §5.3a correction this section carries. The
// spec called it a "read-only reuse view" while giving it two consequential verbs (replace, revoke), and a
// view whose verbs are those two is not read-only. Each row's state offers exactly two NAMED actions;
// `credential-key-row.tsx` owns which pair and why.

import { providerDisplayLabel } from "@orb/contracts/inference";
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
  // The registry rows are the ONE home for a provider's user-facing label (`providerDisplayLabel`) — a
  // credential row carries only the registry ID, which is half an AAD and not a word for a person.
  const { data: providers } = useSuspenseQuery(trpc.connection.providersAvailable.queryOptions());
  const providerLabels = new Map(providers.map((row) => [row.provider.id as string, providerDisplayLabel(row.provider)]));

  return (
    <Section divider={true} heading={CONNECTIONS_KEYS_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_KEYS_SUBCATEGORY.id)}>
      <Text voice="gloss">
        The keys your connections reuse. A key is added from a connection; here you can replace or revoke it. Keys are encrypted and never shown again.
      </Text>

      {credentials.length === 0 ? (
        // @orb-waive empty-state-has-action(EmptyState): the next step is not this section's to offer — a key is never created here, only revoked/removed. Adding one runs through the SIBLING subsection's "Add connection" dialog (`connections-list-section.tsx`, whose own empty state carries that CTA), which owns the dialog's open state locally; the description names that route. ENDS WHEN keys become independently creatable, or the add-connection dialog gains a cross-section opener.
        <EmptyState icon={<Icon icon={KeyRound} size="lg" />} title="No keys yet" description="A key is saved when you add a connection that needs one." />
      ) : (
        <Stack gap="field">
          {credentials.map((credential) => (
            <CredentialKeyRow
              key={credential.id}
              credential={credential}
              providerLabel={providerLabels.get(credential.provider) ?? credential.provider}
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
