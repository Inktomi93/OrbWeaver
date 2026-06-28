// verb: inspectEndpoint — the "Test endpoint" round-trip for a SAVED custom_openai credential (a real
// 1-message request, returning the REDACTED request + raw response; the key never leaves the server — the
// injected `inspect` op redacts before building the result). Owner-scoped by id; the credential is resolved
// to the brand-protected `CustomOpenAiCredential` (via `substrate/mint`) and handed to the providers
// inspector through injection.
//
// FLAG[PD-25]: DRAFT (pre-save) inspect is NOT supported here — the providers diagnostic front door's
// `inspect` takes a `ResolvedCredential`, and `CustomOpenAiCredential.credentialId` is non-null, so an
// unsaved draft cannot be represented without either a nullable-credentialId contract change or a raw
// inspect op on the providers front door. Both are outside this leaf. fetch-models DOES support drafts
// (its infra op takes raw args), so a user can still validate a draft URL's `/models` before saving; the
// full draft round-trip lands when the providers surface grows a raw inspector or the brand goes nullable.

import type { EndpointInspection } from "@orb/contracts/providers";
import type { InspectEndpointParams } from "../contract/params";
import type { CredentialContext, CredentialsService } from "../contract/service";
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
    });
    return ctx.inspect({ credential, model: params.model ?? endpoint.model ?? "" });
  };
}
