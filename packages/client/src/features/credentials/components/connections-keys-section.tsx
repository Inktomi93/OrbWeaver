// The SAVED KEYS section (Settings → Connections) — the credential library: add · set-active (one active per
// provider) · remove · health probe. The secret is never rendered. Owns its own `QueryBoundary`
// (config-revamp-design.md §6.8 — one contributed section per read).

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, KeyRound, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { groupCredentialsByProvider, PROVIDER_LABELS } from "../lib/connections-model.ts";
import { CONNECTIONS_KEYS_SUBCATEGORY } from "../lib/connections-nav.ts";
import { AddCredentialDialog } from "./add-credential-dialog.tsx";
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

/** The caller's OpenRouter account balance — a quiet stat tile. Rendered only when an OpenRouter
 *  credential exists (the query throws a no-credential domain error otherwise). */
function OpenRouterBalanceTile(): ReactElement | null {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.connection.orCredits.queryOptions());
  if (data === undefined) {
    return null;
  }
  return <StatFigure label="OpenRouter balance" value={`$${(data.total - data.used).toFixed(2)}`} />;
}

/** The saved-key library — add + per-key set-active/remove/health. */
function SavedKeysSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const [addOpen, setAddOpen] = useState(false);
  const hasOpenRouter = credentials.some((cred) => cred.provider === "openrouter");

  return (
    <Section divider={true} heading={CONNECTIONS_KEYS_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_KEYS_SUBCATEGORY.id)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text voice="gloss">
          Your provider API keys. One key is active per provider; roles resolve their key from the active one for their source. Keys are encrypted and never
          shown again.
        </Text>
        {/* ONE "Add key" PER VIEWPORT (side-eye 2026-08-06 P2). With no keys yet the empty state below is
            already the section's whole message AND its call to action, so a second primary in the header
            said the same thing twice, 60px apart, and neither one was the obvious next click. The empty
            state owns the verb while the list is empty; this header button is the home once there IS a
            list (the empty state is gone by then). */}
        {credentials.length === 0 ? null : (
          <Button intent="primary" size="sm" onClick={(): void => setAddOpen(true)}>
            <Icon icon={Plus} size="sm" />
            Add key
          </Button>
        )}
      </Row>

      {hasOpenRouter ? <OpenRouterBalanceTile /> : null}

      {credentials.length === 0 ? (
        <EmptyState
          icon={<Icon icon={KeyRound} size="lg" />}
          title="No keys yet"
          description="Add a provider key so your roles can reach a model."
          action={
            // PRIMARY now that it is the section's only "Add key": the empty state IS the call to action.
            <Button intent="primary" size="sm" onClick={(): void => setAddOpen(true)}>
              <Icon icon={Plus} size="sm" />
              Add key
            </Button>
          }
        />
      ) : (
        <Stack gap="block">
          {groupCredentialsByProvider(credentials).map(([provider, rows]) => (
            <Stack key={provider} gap="field">
              <Text voice="kicker">{PROVIDER_LABELS[provider]}</Text>
              {rows.map((credential) => (
                <CredentialKeyRow key={credential.id} credential={credential} trpc={trpc} invalidation={invalidation} />
              ))}
            </Stack>
          ))}
        </Stack>
      )}

      <AddCredentialDialog open={addOpen} onOpenChange={setAddOpen} trpc={trpc} invalidation={invalidation} />
    </Section>
  );
}
