// credentials feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The story reaches a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — CredentialKeyRow is mounted by ConnectionsSettingsSurface itself, not exported standalone.

import { useInvalidation, useTRPC } from "@orb/client/data";
import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ComponentProps, ReactElement } from "react";
import { useState } from "react";
import { CredentialKeyRow } from "../../../../packages/client/src/features/credentials/components/credential-key-row";
import { ModelPicker } from "../../../../packages/client/src/features/credentials/components/model-picker";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

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
