// The box's local generation engine as a stage connection: the one home for the endpoint a stack dials, its provider
// id, and the model the engine lists. `snap --stage-connection local` and the e2e global setup both resolve their
// connection through `resolveLocalEngineModel`, so the two cannot drift on which endpoint or which model.
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { effectiveHttpPort } from "@orb/kit/http-endpoint";
import { ENGINE_PORTS } from "../host/ports.ts";
import type { OrbApi } from "./stage-trpc.ts";
import { stageRefusalReason } from "./stage-trpc.ts";

/** The provider id the engine's connection row is authored under, and its model list is read under. */
export const LOCAL_ENGINE_PROVIDER = "vllm";

/** The generation engine every stack adopts. `/v1` is spelled out so the row is what a user would type. */
export const LOCAL_ENGINE_BASE_URL = `http://127.0.0.1:${String(ENGINE_PORTS.generate)}/v1`;

type ModelListing = Awaited<ReturnType<OrbApi["connection"]["draftCatalogModels"]["mutate"]>>;

export interface LocalEngineModelRequest {
  readonly baseUrl: string;
  /** Written, unchecked, when the engine lists nothing; null makes an unlisted engine an error. */
  readonly fallbackModel: string | null;
  /** On the private-endpoint refusal, add the engine's exact `host:port` to the stage's allowlist and ask again. */
  readonly admit: boolean;
}

export interface LocalEngineModel {
  readonly model: string;
  /** True when the engine's own model list named `model`, so the row may be saved as checked. */
  readonly listed: boolean;
}

/** Ask the engine which model it serves, through the stage's own `connection.draftCatalogModels`. That verb answers a
 *  failed dial with `listed: false` and a reason, so an engine that is down is a branch here, not an exception; a
 *  refusal of the endpoint itself is thrown. */
export async function resolveLocalEngineModel(api: OrbApi, request: LocalEngineModelRequest): Promise<LocalEngineModel> {
  const listing = await admittedListing(api, request);
  const first = listing.listed ? listing.models[0] : undefined;
  if (first !== undefined) {
    return { model: first.id, listed: true };
  }
  if (request.fallbackModel === null) {
    throw new Error(`the local engine at ${request.baseUrl} lists no model${listing.listed ? "" : `: ${listing.reason}`}`);
  }
  return { model: request.fallbackModel, listed: false };
}

async function admittedListing(api: OrbApi, request: LocalEngineModelRequest): Promise<ModelListing> {
  const draft = { providerId: LOCAL_ENGINE_PROVIDER, baseUrl: request.baseUrl };
  if (!request.admit) {
    return await api.connection.draftCatalogModels.mutate(draft);
  }
  // only the private-address refusal is answered here; every other failure is rethrown to the caller. Ends if the refusal stops carrying its code.
  try {
    return await api.connection.draftCatalogModels.mutate(draft);
  } catch (error) {
    if (stageRefusalReason(error) !== CONNECTION_OP_CODES.baseUrlRefused) {
      throw error;
    }
  }
  const { resolved } = await api.settings.getAppSettingsWithOverrides.query();
  await api.settings.updateAppSettings.mutate({
    partial: { privateEndpointAllowlist: [...resolved.privateEndpointAllowlist, endpointAuthority(request.baseUrl)] },
  });
  return await api.connection.draftCatalogModels.mutate(draft);
}

// The `host:port` spelling the refusal names and the owner's Admit writes: that port only, not every port on the host.
function endpointAuthority(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.hostname}:${String(effectiveHttpPort(url.protocol, url.port))}`;
}
