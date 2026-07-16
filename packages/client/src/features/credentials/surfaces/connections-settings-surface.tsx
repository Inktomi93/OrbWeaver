// The Connections settings surface. Two anchored sections:
//   (a) Model roles — the 7 typed role slots, each a compact dense row (slot · source · model). The chat
//       slot carries the protocol `api` knob. The two embed slots warn on a dimension mismatch (both feed
//       one 1024-dim shared vector space). Persists to UserSettings.routing.roleDefaults via a
//       section-autosave form.
//   (b) Saved keys — the credential library: add · set-active (one active per provider) · remove ·
//       health probe. The secret is never rendered.

import type { VerifyAuthResult } from "@orb/contracts/providers";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FieldLayout } from "@orb/ui/field";
import { AlertTriangle, Icon, KeyRound, Plus } from "@orb/ui/icons";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { scrollBehavior } from "@orb/ui/lib";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { AddCredentialDialog } from "../components/add-credential-dialog";
import { CredentialKeyRow } from "../components/credential-key-row";
import { RoleSlotRow } from "../components/role-slot-row";
import { CONNECTIONS_ENTITY_ID, useConnectionsForm } from "../hooks/use-connections-form";
import type { RoutingForm } from "../lib/connections-model";
import {
  embedDimensionWarning,
  groupCredentialsByProvider,
  PROVIDER_LABELS,
  projectRoutingForm,
  ROLE_SLOTS_ORDERED,
  toRoutingSection,
} from "../lib/connections-model";
import { CONNECTIONS_SUBCATEGORY_IDS } from "../lib/connections-nav";

const anchor = (sub: string): string => settingsAnchorId("connections", sub);

interface UpdateRoutingVars {
  readonly section: "routing";
  readonly patch: Record<string, unknown>;
}
const useUpdateRouting = createEntityMutation<UpdateRoutingVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save your model-role settings.",
});

/** The max-pro-sub host-Claude health check (owner-only; the D17 owner gate re-runs inside the verb). A
 *  MUTATION despite being read-shaped — it spends a tiny probe turn. Reconciles nothing; the result is
 *  rendered inline from the returned VerifyAuthResult. */
const useTestClaudeAuth = createEntityMutation<void, VerifyAuthResult>({
  options: (trpc) => trpc.connection.testClaudeAuth.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't reach host Claude — check the subscription login.",
});

/** The Connections pane body (rendered inside the settings modal's category column). */
export function ConnectionsSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your connections…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your connections" onRetry={retry} />}
      >
        <Container>
          <Stack gap="section">
            <ModelRolesSection />
            <HostClaudeSection />
            <SavedKeysSection />
          </Stack>
        </Container>
      </QueryBoundary>
    </Stack>
  );
}

/** Scroll the Saved keys section into view (the red status-dot action). */
function scrollToKeys(): void {
  document.getElementById(anchor(CONNECTIONS_SUBCATEGORY_IDS.keys))?.scrollIntoView({ behavior: scrollBehavior() });
}

/** Section (a): the 7 role slots as compact rows, autosaved to `routing.roleDefaults`. */
function ModelRolesSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const { data: viewer } = useSuspenseQuery(trpc.sessions.me.queryOptions());
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const isOwner = viewer.globalRole === "owner";
  const customCredentialId = credentials.find((cred) => cred.provider === "custom_openai" && cred.active)?.id ?? null;
  const update = useUpdateRouting({ trpc, invalidation });

  const save = (values: RoutingForm): Promise<unknown> =>
    update.mutateAsync({
      section: "routing",
      patch: toRoutingSection(values) as Record<string, unknown>,
    });

  const { form, mountKey } = useConnectionsForm({
    entityId: CONNECTIONS_ENTITY_ID,
    serverValues: projectRoutingForm(data.config.routing),
    save,
  });

  return (
    <Section divider={true} heading="Model roles" id={anchor(CONNECTIONS_SUBCATEGORY_IDS.roles)}>
      <Text size="micro" tone="muted">
        Pick the provider and model for each role. Leave a row on “Default” to let the app choose. Changes save automatically.
      </Text>
      <FieldLayout orientation="horizontal">
        <Stack key={mountKey} gap="block">
          {ROLE_SLOTS_ORDERED.map((slot) => (
            <RoleSlotRow key={slot.role} slot={slot} form={form} isOwner={isOwner} customCredentialId={customCredentialId} onScrollToKeys={scrollToKeys} />
          ))}
          <form.Subscribe selector={(state): string | null => embedDimensionWarning(state.values.embed, state.values.imageEmbed)}>
            {(warning): ReactElement | null =>
              warning === null ? null : (
                <Row gap="field" align="center" role="alert">
                  <Badge intent="warning" size="sm">
                    <Icon icon={AlertTriangle} size="xs" />
                    Dimension mismatch
                  </Badge>
                  <Text size="micro" tone="muted">
                    {warning}
                  </Text>
                </Row>
              )
            }
          </form.Subscribe>
        </Stack>
      </FieldLayout>
    </Section>
  );
}

/** The owner-only host-Claude (max-pro-sub) health check. Renders nothing for a non-owner viewer — the
 *  D17 owner gate also re-runs server-side, so this is UX honesty over that floor. */
function HostClaudeSection(): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: viewer } = useSuspenseQuery(trpc.sessions.me.queryOptions());
  const probe = useTestClaudeAuth({ trpc, invalidation });
  const [result, setResult] = useState<VerifyAuthResult | null>(null);

  if (viewer.globalRole !== "owner") {
    return null;
  }

  const runTest = (): void => {
    void probe
      .mutateAsync()
      .then((next) => setResult(next))
      .catch(() => setResult(null));
  };

  return (
    <Section divider={true} heading="Host Claude">
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text size="micro" tone="muted">
          Check that this box's Claude subscription can reach a model. Sends one tiny probe turn.
        </Text>
        <Button intent="secondary" size="sm" onClick={runTest} disabled={probe.isPending}>
          Test Claude auth
        </Button>
      </Row>
      {result === null ? null : (
        <Row gap="field" align="center" role="status">
          <Badge intent={result.ok ? "success" : "danger"} size="sm">
            {result.ok ? "Reachable" : "Unreachable"}
          </Badge>
          <Text size="micro" tone="muted">
            {result.account?.subscriptionType ?? result.model}
          </Text>
        </Row>
      )}
    </Section>
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

/** Section (b): the saved-key library — add + per-key set-active/remove/health. */
function SavedKeysSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const [addOpen, setAddOpen] = useState(false);
  const hasOpenRouter = credentials.some((cred) => cred.provider === "openrouter");

  return (
    <Section divider={true} heading="Saved keys" id={anchor(CONNECTIONS_SUBCATEGORY_IDS.keys)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text size="micro" tone="muted">
          Your provider API keys. One key is active per provider; roles resolve their key from the active one for their source. Keys are encrypted and never
          shown again.
        </Text>
        <Button intent="primary" size="sm" onClick={(): void => setAddOpen(true)}>
          <Icon icon={Plus} size="sm" />
          Add key
        </Button>
      </Row>

      {hasOpenRouter ? <OpenRouterBalanceTile /> : null}

      {credentials.length === 0 ? (
        <EmptyState
          icon={<Icon icon={KeyRound} size="lg" />}
          title="No keys yet"
          description="Add a provider key so your roles can reach a model."
          action={
            <Button intent="secondary" size="sm" onClick={(): void => setAddOpen(true)}>
              Add key
            </Button>
          }
        />
      ) : (
        <Stack gap="block">
          {groupCredentialsByProvider(credentials).map(([provider, rows]) => (
            <Stack key={provider} gap="field">
              <Text size="micro" tone="muted" transform="caps">
                {PROVIDER_LABELS[provider]}
              </Text>
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
