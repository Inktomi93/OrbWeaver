// The non-secret facts of one resolved encoder, shared by the embeddings owner and the domains that embed a query
// through it. The call closures take an AbortSignal, so the domain that declares each one types it.

import type { UserConnectionId } from "@orb/kit/ids";
import type { Capability, EncoderIdentityApi, EndpointFeatures, ProviderId, Wire } from "../inference/index.ts";

/** Every non-secret field that can change vector geometry. */
export interface EmbeddingConnectionFacts {
  readonly connectionId: UserConnectionId;
  readonly providerId: ProviderId;
  readonly model: string;
  readonly capability: Capability;
  readonly api: EncoderIdentityApi;
  readonly wire: Wire;
  readonly baseUrl: string | null;
  readonly features: EndpointFeatures;
  readonly extras: unknown;
  readonly transport: unknown;
}
