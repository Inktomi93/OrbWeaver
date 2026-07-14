// verb: inspectEndpoint — the "Test endpoint" round-trip for a SAVED custom_openai credential; the key
// never leaves the server (the injected inspect op redacts before building the result).
//
// (PD-25 closed as covered 2026-07-14): draft (pre-save) inspect is deliberately NOT built — the draft arm
// of `fetchModels` already validates reachability + auth pre-save, and the shaped round-trip is available
// immediately post-save via this verb. A draft-inspect would need a raw-args inspect op or a nullable
// `credentialId` on the runner-consumed brand — marginal value over save-then-test.

import type { EndpointInspection } from "@orb/contracts/providers";
import type { CredentialContext } from "../context";
import type { InspectEndpointParams } from "../contract/params";
import type { CredentialsService } from "../contract/service";
import { aadFor } from "../persistence/aad";
import { fetchOwnedCredential } from "../persistence/queries";
import { requireOwned } from "../substrate/credential-not-found";
import { decryptSealed } from "../substrate/decrypt";
import { mintCustomOpenAi } from "../substrate/mint";
import { parseCustomOpenAiEndpoint } from "../substrate/parse-metadata";

/** A non-throwing inspection result for the "this isn't a custom endpoint" case (never leaks a key). */
function notCustomEndpoint(): EndpointInspection {
  return {
    ok: false,
    request: { url: "", headers: {}, body: "" },
    response: null,
    error: "credential is not a custom OpenAI-compatible endpoint",
  };
}

export function createInspectEndpoint(
  ctx: CredentialContext,
): CredentialsService["inspectEndpoint"] {
  return async (params: InspectEndpointParams): Promise<EndpointInspection> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    const row = requireOwned(
      await fetchOwnedCredential(ctx.db, ownerId, credentialId),
      credentialId,
    );
    const endpoint = parseCustomOpenAiEndpoint(row.metadata);
    if (endpoint === null) {
      return notCustomEndpoint();
    }
    const apiKey = decryptSealed(ctx.box, row, aadFor(ownerId, "custom_openai"));
    const credential = mintCustomOpenAi({
      baseUrl: endpoint.baseUrl,
      apiKey: apiKey !== null && apiKey.length > 0 ? apiKey : null,
      headers: endpoint.headers,
      credentialId,
      model: endpoint.model ?? undefined,
      contextWindow: endpoint.contextWindow,
      includeBody: endpoint.includeBody,
      excludeBody: endpoint.excludeBody,
      responseMap: endpoint.responseMap,
    });
    return ctx.inspect({ credential, model: params.model ?? endpoint.model ?? "" });
  };
}
