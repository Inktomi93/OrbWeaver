// The CONNECTIONS settings surface (Settings → APP → Connections — W10 Panel 1; capability-turn-shaping/04
// §W10). The NEO role-slot + key-library PORT (owner-ruled 2026-07-10 — the neo model, NOT
// named-savable-connections). Two anchored sections:
//   (a) MODEL ROLES — the 7 typed role slots (chat · agent · embed · rerank · imageEmbed · summarize ·
//       generateImage), each a COMPACT dense row (slot · source · model) so 7 slots + a FUTURE per-agent
//       list stay compact (owner ruling — space-efficiency is a hard requirement, the agent build reuses
//       this row). The chat slot carries the protocol `api` knob (adjacent-same-role handling moved to the
//       preset — authored in the Assembly, not here; D66-C W6 REVERSED).
//       The two EMBED slots (`embed` text + `imageEmbed` optional) WARN on a dimension mismatch (both feed
//       one 1024-dim shared vector space). Persists to `UserSettings.routing.roleDefaults` (the blob the
//       server `resolveRole` reads — the client never calls the internal resolver) via a section-autosave
//       form ("flip it and it saves", §13.4).
//   (b) SAVED KEYS — the credential library (`trpc.credentials.*`): add · set-active (one active per
//       provider) · remove · health probe. The secret is NEVER rendered (the redacted `CredentialView`,
//       05-observability §5).
//
// The route mounts this into the shell's `settings` modal slot (settings-shell-surface.tsx switch). The
// surface is the containment CONSUMER (§2.1) — its root queries `@container`.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FieldLayout } from "@orb/ui/field";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/Plus/AlertTriangle/KeyRound fine (the tag-settings-surface.tsx precedent).
import { AlertTriangle, Icon, KeyRound, Plus } from "@orb/ui/icons";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import {
  createEntityMutation,
  QueryBoundary,
  QueryErrorState,
  useInvalidation,
  useTRPC,
} from "#data";
import { useFocusOnMount } from "#lib";
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
import { scrollBehavior } from "../lib/scroll-behavior";
import { settingsAnchorId } from "../lib/settings-nav-model";

const anchor = (sub: string): string => settingsAnchorId("connections", sub);

// The routing-section patch mutation (module scope, §13.1). `updateUserSettingsSection` emits
// `settingsChanged` on the always-on user bus, and `USER_BUS_FILTERS.settingsChanged` refetches
// `getUserSettings` — so it is `busDriven` (the echo reconciles this device AND device B; a
// self-`invalidates` would double-refetch — the appearance-surface precedent). TVars.patch is the typed
// section; the router input is a generic `Record<string, unknown>`, hence the one boundary cast at the call.
interface UpdateRoutingVars {
  readonly section: "routing";
  readonly patch: Record<string, unknown>;
}
const useUpdateRouting = createEntityMutation<UpdateRoutingVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save your model-role settings.",
});

/** The Connections pane body (rendered inside the settings modal's category column). */
export function ConnectionsSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your connections…</Text>}
        renderError={(_error, retry): ReactElement => (
          <QueryErrorState label="your connections" onRetry={retry} />
        )}
      >
        <Container>
          <Stack gap="section">
            <ModelRolesSection />
            <SavedKeysSection />
          </Stack>
        </Container>
      </QueryBoundary>
    </Stack>
  );
}

/** Scroll the Saved keys section into view (the red status-dot action — anchor helper, surface line 47). */
function scrollToKeys(): void {
  document
    .getElementById(anchor(CONNECTIONS_SUBCATEGORY_IDS.keys))
    ?.scrollIntoView({ behavior: scrollBehavior() });
}

/** Section (a): the 7 role slots as compact rows, autosaved to `routing.roleDefaults`. */
function ModelRolesSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  // `sessions.me` gates the D17 owner-only `max-pro-sub` source option (visible-but-disabled for a
  // non-owner). `credentials.list` finds the active custom_openai key the picker probes on open.
  const { data: viewer } = useSuspenseQuery(trpc.sessions.me.queryOptions());
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const isOwner = viewer.globalRole === "owner";
  const customCredentialId =
    credentials.find((cred) => cred.provider === "custom_openai" && cred.active)?.id ?? null;
  const update = useUpdateRouting({ trpc, invalidation });

  const save = (values: RoutingForm): Promise<unknown> =>
    // The whole `routing` section is written (an unset slot round-trips to "no preference"). The router
    // input is a generic `Record<string, unknown>`, hence the one boundary cast.
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
        Pick the provider and model for each role. Leave a row on “Default” to let the app choose.
        Changes save automatically.
      </Text>
      {/* Horizontal field grammar for any bound fields nested below (the compact rows own their own Row
          layout; this keeps the ambient orientation consistent with the other settings panes). */}
      <FieldLayout orientation="horizontal">
        <Stack key={mountKey} gap="block">
          {ROLE_SLOTS_ORDERED.map((slot) => (
            <RoleSlotRow
              key={slot.role}
              slot={slot}
              form={form}
              isOwner={isOwner}
              customCredentialId={customCredentialId}
              onScrollToKeys={scrollToKeys}
            />
          ))}
          {/* The embed-dimension mismatch advisory — reads the live embed + imageEmbed selections. */}
          <form.Subscribe
            selector={(state): string | null =>
              embedDimensionWarning(state.values.embed, state.values.imageEmbed)
            }
          >
            {(warning): ReactElement | null =>
              warning === null ? null : (
                <Row gap="field" align="center" role="alert">
                  {/* Badge carries the warning token pair so the lucide glyph (currentColor) + text read
                      as one warning chip — Icon has no color prop (compose-only; color via context). */}
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

/** Section (b): the saved-key library — add + per-key set-active/remove/health. */
function SavedKeysSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Section divider={true} heading="Saved keys" id={anchor(CONNECTIONS_SUBCATEGORY_IDS.keys)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text size="micro" tone="muted">
          Your provider API keys. One key is active per provider; roles resolve their key from the
          active one for their source. Keys are encrypted and never shown again.
        </Text>
        <Button intent="primary" size="sm" onClick={(): void => setAddOpen(true)}>
          <Icon icon={Plus} size="sm" />
          Add key
        </Button>
      </Row>

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
                <CredentialKeyRow
                  key={credential.id}
                  credential={credential}
                  trpc={trpc}
                  invalidation={invalidation}
                />
              ))}
            </Stack>
          ))}
        </Stack>
      )}

      <AddCredentialDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        trpc={trpc}
        invalidation={invalidation}
      />
    </Section>
  );
}
