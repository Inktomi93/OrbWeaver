// credentials feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The story reaches a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — CredentialKeyRow is mounted by ConnectionsSettingsSurface itself, not exported standalone.

import { useInvalidation, useTRPC } from "@orb/client/data";
import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { CredentialKeyRow } from "../../../../packages/client/src/features/credentials/components/credential-key-row";
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
