// verb: fetchModels — list a custom_openai endpoint's model ids (`GET {baseUrl}/models`) via the injected
// infra/network op (best-effort; `[]` on any failure → the UI falls back to manual model entry). Two
// sources: a DRAFT (raw form fields, pre-save — wins) or an existing SAVED credential (by id, owner-scoped:
// decrypt the key + read the endpoint's metadata). Neither → `[]`. A corrupt/non-custom row → `[]` (the
// `parseCustomOpenAiEndpoint` seam guarantees no fetch against an `undefined` URL).

import { getLog } from "#foundation/observability";
import type { CredentialContext } from "../context";
import type { FetchModelsParams } from "../contract/params";
import type { CredentialsService } from "../contract/service";
import { aadFor } from "../persistence/aad";
import { fetchOwnedCredential } from "../persistence/queries";
import { decryptSealed } from "../substrate/decrypt";
import { parseCustomOpenAiEndpoint } from "../substrate/parse-metadata";

const NO_MODELS: string[] = [];

export function createFetchModels(ctx: CredentialContext): CredentialsService["fetchModels"] {
  return async (params: FetchModelsParams): Promise<string[]> => {
    if (params.draft !== undefined) {
      return ctx.fetchModels({
        baseUrl: params.draft.baseUrl,
        apiKey: params.draft.key ?? null,
        headers: params.draft.headers ?? null,
      });
    }
    if (params.credentialId === undefined) {
      return NO_MODELS;
    }
    const ownerId = params.principal.userId;
    const row = await fetchOwnedCredential(ctx.db, ownerId, params.credentialId);
    if (row === undefined) {
      return NO_MODELS;
    }
    const endpoint = parseCustomOpenAiEndpoint(row.metadata);
    if (endpoint === null) {
      getLog().info({ credentialId: params.credentialId }, "credentials: fetchModels on a non-custom_openai credential — returning []");
      return NO_MODELS;
    }
    const apiKey = decryptSealed(ctx.box, row, aadFor(ownerId, "custom_openai"));
    return ctx.fetchModels({ baseUrl: endpoint.baseUrl, apiKey, headers: endpoint.headers });
  };
}
