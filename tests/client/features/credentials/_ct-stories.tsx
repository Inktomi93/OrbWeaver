// credentials feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The story reaches a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — CredentialKeyRow is mounted by ConnectionsSettingsSurface itself, not exported standalone.

import { useInvalidation, useTRPC } from "@orb/client/data";
import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import type { ComponentProps, ReactElement } from "react";
import { useState } from "react";
import { CredentialKeyRow } from "../../../../packages/client/src/features/credentials/components/credential-key-row.tsx";
import { ModelPicker } from "../../../../packages/client/src/features/credentials/components/model-picker.tsx";
import { ConnectionsSettingsSurface } from "../../../../packages/client/src/features/credentials/surfaces/connections-settings-surface.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

/** `<CredentialKeyRow>` under the data layer (`trpc`/`invalidation` read inside the provider tree — the
 *  row's own wiring); its mutations are stubbed per-test via routeTrpc. */
function CredentialKeyRowInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return (
    <CredentialKeyRow
      credential={{
        id: castId<UserCredentialId>("user_credential_ctstory0001"),
        provider: "openrouter",
        label: "prod key",
        active: false,
        hasMetadata: false,
        revokedAt: null,
        createdAt: 0,
        updatedAt: 0,
      }}
      invalidation={invalidation}
      trpc={trpc}
    />
  );
}

export function CredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <CredentialKeyRowInner />
      </div>
    </CtDataProviders>
  );
}

/** A `custom_openai` `<CredentialKeyRow>` — the row that carries the "Test endpoint" inspector affordance.
 *  The `credentials.inspectEndpoint` mutation the dialog fires on open is stubbed per-test via routeTrpc. */
function CustomCredentialKeyRowInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return (
    <CredentialKeyRow
      credential={{
        id: castId<UserCredentialId>("user_credential_ctstory0002"),
        provider: "custom_openai",
        label: "my endpoint",
        active: true,
        hasMetadata: true,
        revokedAt: null,
        createdAt: 0,
        updatedAt: 0,
      }}
      invalidation={invalidation}
      trpc={trpc}
    />
  );
}

export function CustomCredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <CustomCredentialKeyRowInner />
      </div>
    </CtDataProviders>
  );
}

/** A REVOKED `<CredentialKeyRow>` (revokedAt set) — the row that carries the "Clear revoked" recover
 *  affordance instead of "Mark revoked"/"Set active". The `credentials.clearRevoked` mutation is stubbed
 *  per-test via routeTrpc. */
function RevokedCredentialKeyRowInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return (
    <CredentialKeyRow
      credential={{
        id: castId<UserCredentialId>("user_credential_ctstory0003"),
        provider: "openrouter",
        label: "prod key",
        active: false,
        hasMetadata: false,
        revokedAt: 1,
        createdAt: 0,
        updatedAt: 0,
      }}
      invalidation={invalidation}
      trpc={trpc}
    />
  );
}

export function RevokedCredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <RevokedCredentialKeyRowInner />
      </div>
    </CtDataProviders>
  );
}

/** `<ModelPicker>` standalone — the row's controlled contract, driven by a caller-supplied facade result.
 *  No data providers: the picker takes `result` as a prop (the surface owns the query). The committed id is
 *  mirrored into `model-picker-value` so a CT can assert the selection actually fired. */
export function ModelPickerStory({
  source,
  result,
}: {
  readonly source: ComponentProps<typeof ModelPicker>["source"];
  readonly result: ComponentProps<typeof ModelPicker>["result"];
}): ReactElement {
  const [value, setValue] = useState("");
  return (
    <div style={{ width: 560 }}>
      <ModelPicker
        source={source}
        ariaLabel="Chat model"
        value={value}
        onValueChange={setValue}
        result={result}
        isLoading={false}
        ghostLabel="Choose a model"
      />
      <div data-testid="model-picker-value">{value}</div>
    </div>
  );
}

/** The whole Connections pane over the real data layer — the LIVE-vs-DRAFT surface (the 2026-08-01 phantom:
 *  a never-persisted selection rendered exactly like the live connection, under a "Saved" chip). Every read
 *  (`settings.getUserSettings`, `sessions.me`, `credentials.list`, `connection.getModelsForSource`) and the
 *  `settings.updateUserSettingsSection` write are stubbed per-test via routeTrpc. The "refetch settings"
 *  button stands in for the bus-driven `settingsChanged` refetch: the mutation is `busDriven: true`, so it
 *  invalidates nothing itself — the USER_BUS does, and a CT has no bus. */
function ConnectionsPaneInner(): ReactElement {
  const queryClient = useQueryClient();
  return (
    <div>
      <ConnectionsSettingsSurface />
      <button type="button" onClick={(): void => void queryClient.invalidateQueries()}>
        refetch settings
      </button>
    </div>
  );
}

export function ConnectionsSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <ConnectionsPaneInner />
      </div>
    </CtDataProviders>
  );
}
