// domain/credentials — COMPOSITION ROOT. Wires the 13 verbs over the injected `CredentialContext` (db +
// determinism seam + SecretBox + owner guard + provider/network ops). ZERO logic: it only calls the verb
// factories and assembles the `CredentialsService`. The context is built at the entry composition root and
// passed in (credentials sideways-imports none of its injected deps — domain-no-cross-feature).

import type { CredentialContext } from "./context.ts";
import type { CredentialsService } from "./contract/service.ts";
import { createAdd } from "./verbs/add.ts";
import { createClearRevoked } from "./verbs/clear-revoked.ts";
import { createFetchModels } from "./verbs/fetch-models.ts";
import { createInspectEndpoint } from "./verbs/inspect-endpoint.ts";
import { createList } from "./verbs/list.ts";
import { createMarkRevoked } from "./verbs/mark-revoked.ts";
import { createMarkRevokedByUser } from "./verbs/mark-revoked-by-user.ts";
import { createMaybeRevokeOnAuthFailed } from "./verbs/maybe-revoke-on-auth-failed.ts";
import { createProbeKeyDecrypt } from "./verbs/probe-key-decrypt.ts";
import { createRemove } from "./verbs/remove.ts";
import { createResolve } from "./verbs/resolve.ts";
import { createSetActive } from "./verbs/set-active.ts";
import { createTestHealth } from "./verbs/test-health.ts";

export function createCredentialsService(ctx: CredentialContext): CredentialsService {
  return {
    resolve: createResolve(ctx),
    maybeRevokeOnAuthFailed: createMaybeRevokeOnAuthFailed(ctx),
    add: createAdd(ctx),
    setActive: createSetActive(ctx),
    remove: createRemove(ctx),
    list: createList(ctx),
    testHealth: createTestHealth(ctx),
    markRevoked: createMarkRevoked(ctx),
    markRevokedByUser: createMarkRevokedByUser(ctx),
    clearRevoked: createClearRevoked(ctx),
    probeKeyDecrypt: createProbeKeyDecrypt(ctx),
    fetchModels: createFetchModels(ctx),
    inspectEndpoint: createInspectEndpoint(ctx),
  };
}
