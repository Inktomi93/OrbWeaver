// The MODEL ROLES section (Settings → Connections) — the 7 typed role slots, each a compact dense row
// (slot · source · model). The chat slot carries the protocol `api` knob. The two embed slots warn on a
// dimension mismatch (both feed one 1024-dim shared vector space). Persists to
// `UserSettings.routing.roleDefaults` via a section-autosave form. Owns its own `QueryBoundary`
// (config-revamp-design.md §6.8 — one contributed section per read, so a slow credentials read never blanks
// the keys section beside it).

import type { UserCredentialId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { FieldLayout } from "@orb/ui/field";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { scrollBehavior } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { SectionSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { CONNECTIONS_ENTITY_ID, ConnectionsForm } from "../hooks/use-connections-form.ts";
import type { RoutingForm } from "../lib/connections-model.ts";
import { embedDimensionWarning, projectRoutingForm, ROLE_SLOTS_ORDERED, toRoutingSection } from "../lib/connections-model.ts";
import { CONNECTIONS_KEYS_SUBCATEGORY, CONNECTIONS_ROLES_SUBCATEGORY } from "../lib/connections-nav.ts";
import { RoleSlotRow } from "./role-slot-row.tsx";

interface UpdateRoutingVars {
  readonly section: "routing";
  readonly patch: Record<string, unknown>;
}

/** The settings row both `getUserSettings` and `updateUserSettingsSection` resolve to — DERIVED off the
 *  READ (the view lives server-side, so the wire shape is only nameable through the proxy). Deriving it
 *  from the read is what proves the write's echo is assignable to the read's cache entry. */
type UserSettingsRow = inferOutput<Trpc["settings"]["getUserSettings"]>;

const useUpdateRouting = createEntityMutation<UpdateRoutingVars, UserSettingsRow>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  // ADOPT THE WRITE'S OWN ECHO (the 2026-08-02 stuck-chip incident). The verb returns the authoritative
  // post-write row — the identical view `getUserSettings` serves — and this section's entire honesty (the
  // per-row "a turn still uses X" disclosure AND the Saving…/Saved status) is computed against that read.
  // `busDriven: true` is right (the server DOES emit `settingsChanged`), but it made the section's truth
  // hostage to a bus tick it cannot observe: with the user-bus stream dropped or late, five 200-OK saves
  // left the row stuck on "Not applied yet — a turn still uses OpenRouter · …" over a selection the DB
  // already held — the loudest possible lie, in the one surface built to kill exactly that lie.
  echo: (trpc) => trpc.settings.getUserSettings.queryKey(),
  errorToast: "Couldn't save your model-role settings.",
});

/** Scroll the Saved keys section into view (the red status-dot action) — through the shared nav constant,
 *  so it can never address an anchor the keys section does not stamp. */
function scrollToKeys(): void {
  document.getElementById(configAnchorId("connections", CONNECTIONS_KEYS_SUBCATEGORY.id))?.scrollIntoView({ behavior: scrollBehavior() });
}

export function ConnectionsRolesSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into one row per model role — the tallest block on this pane.
    <QueryBoundary
      fallback={<SkeletonRows count={4} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your model roles" onRetry={retry} />}
      reserveKey="config.connections.roles"
    >
      <ModelRolesSection />
    </QueryBoundary>
  );
}

/** The 7 role slots as compact rows, autosaved to `routing.roleDefaults`. */
function ModelRolesSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const { data: viewer } = useSuspenseQuery(trpc.sessions.me.queryOptions());
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const isOwner = viewer.globalRole === "owner";
  const customCredentialId = credentials.find((cred) => cred.provider === "custom_openai" && cred.active)?.id ?? null;
  const update = useUpdateRouting({ trpc, invalidation });
  // The PERSISTED projection — the section's LIVE truth (what `resolveRole` reads at turn time), distinct
  // from the form values the rows render. Both are threaded down so every row can disclose which one it shows.
  const persisted = projectRoutingForm(data.config.routing);

  // The mutation's `echo` seeds `getUserSettings` with the write's authoritative response, so `persisted`
  // above is post-write the moment this promise resolves — the row's disclosure retires without a refetch.
  const save = (values: RoutingForm): Promise<unknown> =>
    update.mutateAsync({
      section: "routing",
      patch: toRoutingSection(values) as Record<string, unknown>,
    });

  return (
    <ConnectionsForm entityId={CONNECTIONS_ENTITY_ID} serverValues={persisted} save={save}>
      {(session): ReactElement => <ModelRolesBody session={session} persisted={persisted} isOwner={isOwner} customCredentialId={customCredentialId} />}
    </ConnectionsForm>
  );
}

interface ModelRolesBodyProps {
  readonly session: AutosaveSession<RoutingForm>;
  readonly persisted: RoutingForm;
  readonly isOwner: boolean;
  readonly customCredentialId: UserCredentialId | null;
}

/** The form-bearing role-slots body — remounted per epoch by the boundary's keyed Session. */
function ModelRolesBody({ session, persisted, isOwner, customCredentialId }: ModelRolesBodyProps): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section divider={true} heading={CONNECTIONS_ROLES_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_ROLES_SUBCATEGORY.id)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text voice="gloss">Pick the provider and model for each role. Leave a row on “Default” to let the app choose.</Text>
        {/* The section's `saveState` already can't read "Saved" while a row is drifted: the factory's `save`
            echo seeds the persisted read (`persisted` above) from the SAME mutation resolution that
            re-baselines the session, so `saveState === "saved"` and a drifted row never co-occur here (#85
            retired the pre-#81 local fold that used to guard for it — `foldSaveState` owns the vocabulary
            now, D78 §6). Which rows are drafts, and what a turn resolves meanwhile, is disclosed per row
            (RowSyncDisclosure).
            THROUGH THE SEAM, not a bare `<AutosaveStatus>` (side-eye 2026-08-06 P2): every other settings
            section says "Saved" once, bottom-left, in the host's aggregate footer, and this one said its own
            "Saved" top-right — two homes for one fact. `SectionSaveStatus` REPORTS into the aggregate and
            renders inline only on `error`, so the failure still surfaces where it happened (D41). */}
        <SectionSaveStatus id={CONNECTIONS_ROLES_SUBCATEGORY.id} state={saveState} onRetry={retrySave} />
      </Row>
      <FieldLayout orientation="horizontal">
        <Stack gap="block">
          {ROLE_SLOTS_ORDERED.map((slot) => (
            <RoleSlotRow
              key={slot.role}
              slot={slot}
              form={form}
              persisted={persisted}
              saveState={saveState}
              isOwner={isOwner}
              customCredentialId={customCredentialId}
              onScrollToKeys={scrollToKeys}
            />
          ))}
          <form.Subscribe selector={(state): string | null => embedDimensionWarning(state.values.embed, state.values.imageEmbed)}>
            {(warning): ReactElement | null =>
              warning === null ? null : (
                <Row gap="field" align="center" role="alert">
                  <Badge intent="warning" size="sm">
                    <Icon icon={AlertTriangle} size="xs" />
                    Dimension mismatch
                  </Badge>
                  <Text voice="gloss">{warning}</Text>
                </Row>
              )
            }
          </form.Subscribe>
        </Stack>
      </FieldLayout>
    </Section>
  );
}
