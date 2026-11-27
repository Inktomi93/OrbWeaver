// `--stage-connection`: bind the stage owner's chat role to a working connection through the product's own verbs, as
// the owner fallback of a loopback call. A key is read by name and held private; it reaches the stage only as the
// body of `credentials.add` or `credentials.replace` and is never printed or returned. The local engine is admitted the way the owner's Admit
// admits it: on the refusal, its exact host and port join the stage copy's private-endpoint allowlist, because a
// cloned allowlist names the source box's hosts and a multi-user stage starts with none.
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { LOCAL_ENGINE_BASE_URL, LOCAL_ENGINE_PROVIDER, resolveLocalEngineModel } from "../../floor/http/local-engine.ts";
import type { OrbApi } from "../../floor/http/stage-trpc.ts";
import type { ProviderKeyName } from "../../floor/process/operator-keys.ts";
import { MAIN_ENV_FILE, operatorKey, readMainEnv } from "../../floor/process/operator-keys.ts";
import type { PrivateText } from "../contract/disk-safe-argv.ts";
import type { SeededStageConnection, StageConnectionChoice, StageConnectionSeed } from "../contract/stage-connection.ts";
import { STAGE_CONNECTION_LABEL_PREFIX, STAGE_HOSTED_CONNECTIONS, STAGE_LOCAL_ENGINE } from "../contract/stage-connection.ts";
import { privateText } from "../lib/private-values.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const CHAT_TASK = "chat";
const LOCAL_ENGINE_LABEL = `${STAGE_CONNECTION_LABEL_PREFIX} local engine`;

// A create input that names its label, provider and model, so the result can report them.
type ConnectionDraft = Parameters<OrbApi["connection"]["create"]["mutate"]>[0] & SeededStageConnection;

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

async function hostedDraft(api: OrbApi, name: ProviderKeyName, key: PrivateText): Promise<ConnectionDraft> {
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

// A refusal other than the private-address one is rethrown to configureStage, which prints it as a STAGE ERROR.
async function localEngineDraft(api: OrbApi, baseUrl: string): Promise<ConnectionDraft> {
  const { model } = await resolveLocalEngineModel(api, { baseUrl, fallbackModel: null, admit: true });
  return { label: LOCAL_ENGINE_LABEL, providerId: LOCAL_ENGINE_PROVIDER, credentialId: null, baseUrl, model, modelCheck: "listed" };
}
