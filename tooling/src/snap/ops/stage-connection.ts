// `--stage-connection`: bind the stage owner's chat role to a working connection through the product's own verbs, as
// the owner fallback of a loopback call. A key is read by name and held private; it reaches the stage only as the
// body of `credentials.add` or `credentials.replace` and is never printed or returned. The local engine is admitted the way the owner's Admit
// admits it: on the refusal, its exact host and port join the stage copy's private-endpoint allowlist, because a
// cloned allowlist names the source box's hosts and a multi-user stage starts with none.
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { effectiveHttpPort } from "@orb/kit/http-endpoint";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { ENGINE_PORTS } from "../../floor/host/ports.ts";
import type { OrbApi } from "../../floor/http/stage-trpc.ts";
import { stageRefusalReason } from "../../floor/http/stage-trpc.ts";
import { MAIN_ENV_FILE, operatorKey, readMainEnv } from "../../floor/process/operator-keys.ts";
import type { PrivateText } from "../contract/disk-safe-argv.ts";
import type { SeededStageConnection, StageConnectionChoice, StageConnectionKeyName, StageConnectionSeed } from "../contract/stage-connection.ts";
import { STAGE_CONNECTION_LABEL_PREFIX, STAGE_HOSTED_CONNECTIONS, STAGE_LOCAL_ENGINE } from "../contract/stage-connection.ts";
import { privateText } from "../lib/private-values.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const CHAT_TASK = "chat";
const LOCAL_ENGINE_LABEL = `${STAGE_CONNECTION_LABEL_PREFIX} local engine`;
const LOCAL_ENGINE_PROVIDER = "vllm";
const LOCAL_ENGINE_BASE_URL = `http://127.0.0.1:${String(ENGINE_PORTS.generate)}/v1`;

// A create input that names its label, provider and model, so the result can report them.
type ConnectionDraft = Parameters<OrbApi["connection"]["create"]["mutate"]>[0] & SeededStageConnection;
type ModelListing = Awaited<ReturnType<OrbApi["connection"]["draftCatalogModels"]["mutate"]>>;

/** Resolve a choice before the stage boots, so a missing key refuses without a rebuild. The process env wins over the
 *  main checkout's `.env`. */
export function resolveStageConnectionSeed(choice: StageConnectionChoice): StageConnectionSeed {
  if (choice === STAGE_LOCAL_ENGINE) {
    return { kind: "local", baseUrl: LOCAL_ENGINE_BASE_URL };
  }
  const value = operatorKey(choice, readMainEnv());
  if (value === null) {
    throw new Error(`--stage-connection ${choice}: ${choice} is set in neither the environment nor the main checkout's ${MAIN_ENV_FILE}`);
  }
  return { kind: "key", name: choice, key: privateText(value) };
}

/** Create the seed's connection, or bring an earlier run's row (found by its label) to this draft, and point the owner's
 *  chat role at it. */
export async function seedStageConnection(api: OrbApi, seed: StageConnectionSeed): Promise<SeededStageConnection> {
  const draft = seed.kind === "local" ? await localEngineDraft(api, seed.baseUrl) : await hostedDraft(api, seed.name, seed.key);
  const existing = (await api.connection.list.query()).find((connection) => connection.label === draft.label);
  const { model, credentialId, baseUrl } = draft;
  const connectionId =
    existing === undefined
      ? (await api.connection.create.mutate(draft)).id
      : (await api.connection.update.mutate({ connectionId: existing.id, patch: { model, credentialId, baseUrl } })).id;
  await api.connection.setBinding.mutate({ task: CHAT_TASK, connectionId });
  return { label: draft.label, providerId: draft.providerId, model: draft.model };
}

async function hostedDraft(api: OrbApi, name: StageConnectionKeyName, key: PrivateText): Promise<ConnectionDraft> {
  const { providerId, model } = STAGE_HOSTED_CONNECTIONS[name];
  if (!(await api.credentials.storageStatus.query()).enabled) {
    throw new Error("credential storage is off on the stage, so it cannot hold a key");
  }
  const label = `${STAGE_CONNECTION_LABEL_PREFIX} ${name}`;
  // A seed from an earlier run is re-keyed, so a rotated key, or one that replaces a revoked key, takes effect.
  const stored = (await api.credentials.list.query()).find((credential) => credential.provider === providerId && credential.label === label);
  const credentialId =
    stored === undefined
      ? (await api.credentials.add.mutate({ provider: providerId, label, key: key.reveal() })).id
      : (await api.credentials.replace.mutate({ credentialId: stored.id, key: key.reveal() })).id;
  return { label, providerId, credentialId, baseUrl: null, model };
}

async function localEngineDraft(api: OrbApi, baseUrl: string): Promise<ConnectionDraft> {
  const listing = await admittedListing(api, baseUrl);
  const first = listing.listed ? listing.models[0] : undefined;
  if (first === undefined) {
    throw new Error(`the local engine at ${baseUrl} lists no model${listing.listed ? "" : `: ${listing.reason}`}`);
  }
  return { label: LOCAL_ENGINE_LABEL, providerId: LOCAL_ENGINE_PROVIDER, credentialId: null, baseUrl, model: first.id, modelCheck: "listed" };
}

async function admittedListing(api: OrbApi, baseUrl: string): Promise<ModelListing> {
  const draft = { providerId: LOCAL_ENGINE_PROVIDER, baseUrl };
  // only the private-address refusal is answered here; every other failure is rethrown to configureStage, which prints it as a STAGE ERROR. Ends if the refusal stops carrying its code.
  try {
    return await api.connection.draftCatalogModels.mutate(draft);
  } catch (error) {
    if (stageRefusalReason(error) !== CONNECTION_OP_CODES.baseUrlRefused) {
      throw error;
    }
  }
  const { resolved } = await api.settings.getAppSettingsWithOverrides.query();
  await api.settings.updateAppSettings.mutate({ partial: { privateEndpointAllowlist: [...resolved.privateEndpointAllowlist, endpointAuthority(baseUrl)] } });
  return await api.connection.draftCatalogModels.mutate(draft);
}

// The `host:port` spelling the refusal names and the owner's Admit writes: that port only, not every port on the host.
function endpointAuthority(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.hostname}:${String(effectiveHttpPort(url.protocol, url.port))}`;
}
