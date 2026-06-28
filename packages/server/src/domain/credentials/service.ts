// domain/credentials — COMPOSITION ROOT. Wires the 15 verbs over the injected `CredentialContext` (db +
// determinism seam + SecretBox + owner guard + provider/network ops). ZERO logic: it only calls the verb
// factories and assembles the `CredentialsService`. The context is built at the entry composition root and
// passed in (credentials sideways-imports none of its injected deps — domain-no-cross-feature). The three
// boot/connection mints (`mint-vllm`/`mint-local-light`/`build-keyless-catalog`) are pure brand markers, so
// their factories take no ctx.

import type { CredentialContext, CredentialsService } from "./contract/service";
import { createAdd } from "./verbs/add";
import { createBuildKeylessCatalog } from "./verbs/build-keyless-catalog";
import { createClearRevoked } from "./verbs/clear-revoked";
import { createFetchModels } from "./verbs/fetch-models";
import { createInspectEndpoint } from "./verbs/inspect-endpoint";
import { createList } from "./verbs/list";
import { createMarkRevoked } from "./verbs/mark-revoked";
import { createMarkRevokedByUser } from "./verbs/mark-revoked-by-user";
import { createMaybeRevokeOnAuthFailed } from "./verbs/maybe-revoke-on-auth-failed";
import { createMintLocalLight } from "./verbs/mint-local-light";
import { createMintVllm } from "./verbs/mint-vllm";
import { createRemove } from "./verbs/remove";
import { createResolve } from "./verbs/resolve";
import { createSetActive } from "./verbs/set-active";
import { createTestHealth } from "./verbs/test-health";

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
    fetchModels: createFetchModels(ctx),
    inspectEndpoint: createInspectEndpoint(ctx),
    mintVllmCredential: createMintVllm(),
    mintLocalLightCredential: createMintLocalLight(),
    buildKeylessCatalogCredential: createBuildKeylessCatalog(),
  };
}
