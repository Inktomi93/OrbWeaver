// The live agent-sdk model-catalog fetch (the daemon's `supportedModels()` control-channel call), under ONE
// user's connection (the daemon authenticates with that user's token). Opens a held-open streaming query
// through the firewall so the daemon initializes and answers without a billed turn, then interrupts it in
// `finally` under its OWN short deadline. Normalizes the SDK's `ModelInfo[]` into the SDK-free `AgentSdkModel[]`.
// Also the `verifyAuth` diagnostic — ONE trivial prompt through the SAME firewall a real turn uses.

import type { AccountInfo, ModelInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/inference";
import type { VerifyAuthAccount, VerifyAuthResult } from "@orb/contracts/providers";
import type { VerifyAuthRequest } from "../../contract/diagnostics.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { AgentSdkLog } from "./log.ts";
import { linkAbort } from "./runner.ts";
import { disciplineOptions, observabilityOptions } from "./translate.ts";
import type { AgentSdkDeps, SpawnIdentity } from "./types.ts";
import { assertInitFrameShape } from "./verify.ts";

const DISCOVERY_TIMEOUT_MS = 15_000;
/** The teardown's own bound: a daemon wedged on `supportedModels()` may never answer `interrupt()` either. */
const INTERRUPT_TIMEOUT_MS = 2000;
const VERIFY_PROMPT = "Reply with exactly the two characters: ok";
const ACCOUNT_INFO_PROBE_TIMEOUT_MS = 2000;

// biome-ignore lint/correctness/useYield: an empty async generator IS the held-open no-turn prompt.
async function* heldOpenPrompt(): AsyncGenerator<never> {
  await Promise.resolve();
}

function withTimeout<T>(promise: Promise<T>, deps: AgentSdkDeps, ms: number, what: string): Promise<T> {
  let cancel: (() => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    cancel = deps.scheduleTimeout(
      () => reject(new ProviderError({ kind: "server", retryable: true, message: `agent-sdk ${what} timed out after ${ms}ms` })),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => cancel?.());
}

function normalize(info: ModelInfo): AgentSdkModel {
  return {
    alias: info.value,
    resolvedModel: info.resolvedModel ?? null,
    displayName: info.displayName,
    description: info.description,
    supportsEffort: info.supportsEffort ?? false,
    effortLevels: [...(info.supportedEffortLevels ?? [])],
    supportsAdaptiveThinking: info.supportsAdaptiveThinking ?? false,
  };
}

function discoveryError(err: unknown): ProviderError {
  return err instanceof ProviderError
    ? err
    : new ProviderError({
        kind: "server",
        retryable: true,
        message: `agent-sdk model discovery failed: ${err instanceof Error ? err.message : String(err)}`,
        cause: err,
      });
}

export async function fetchAgentSdkModels(connection: SpawnIdentity, deps: AgentSdkDeps, log: AgentSdkLog): Promise<AgentSdkModel[]> {
  const stream: Query = deps.query({ prompt: heldOpenPrompt(), options: disciplineOptions(deps.childEnv(connection)) });
  try {
    const models = await withTimeout(stream.supportedModels(), deps, DISCOVERY_TIMEOUT_MS, "model discovery").catch((err: unknown) => {
      throw discoveryError(err);
    });
    return models.map(normalize);
  } finally {
    // Billing cleanup for a turn that never started — best-effort AND BOUNDED; logged, never thrown.
    try {
      await withTimeout(stream.interrupt(), deps, INTERRUPT_TIMEOUT_MS, "discovery turn teardown");
    } catch (err) {
      log.warn({ err }, "agent-sdk model discovery: turn teardown did not complete — the spawn may already be gone");
    }
  }
}

async function reduceVerifyStream(stream: Query): Promise<{ apiKeySource: string; reply: string; ok: boolean; costUsd: number }> {
  let apiKeySource = "unknown";
  let reply = "";
  let ok = false;
  let costUsd = 0;
  for await (const message of stream) {
    if (message.type === "system" && message.subtype === "init") {
      assertInitFrameShape(message);
      apiKeySource = message.apiKeySource;
    } else if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          reply += block.text;
        }
      }
    } else if (message.type === "result") {
      ok = !message.is_error;
      costUsd = message.total_cost_usd;
    }
  }
  return { apiKeySource, reply, ok, costUsd };
}

function toVerifyAuthAccount(info: AccountInfo): VerifyAuthAccount {
  return {
    ...(info.email !== undefined ? { email: info.email } : {}),
    ...(info.organization !== undefined ? { organization: info.organization } : {}),
    ...(info.subscriptionType !== undefined ? { subscriptionType: info.subscriptionType } : {}),
    ...(info.apiProvider !== undefined ? { apiProvider: info.apiProvider } : {}),
  };
}

/** Best-effort account-identity probe against the LIVE query handle — bounded and TOTALLY non-fatal. */
async function probeAccountInfo(query: Query, deps: AgentSdkDeps): Promise<VerifyAuthAccount | undefined> {
  if (typeof query.accountInfo !== "function") {
    return;
  }
  let cancel: (() => void) | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    cancel = deps.scheduleTimeout(() => resolve(undefined), ACCOUNT_INFO_PROBE_TIMEOUT_MS);
  });
  let account: VerifyAuthAccount | undefined;
  try {
    const info = await Promise.race([query.accountInfo(), timeout]);
    account = info !== undefined ? toVerifyAuthAccount(info) : undefined;
  } catch {
    // A rejected control call is a diagnostic miss, never a probe failure.
  } finally {
    cancel?.();
  }
  return account;
}

/** The subscription auth verify: `maxTurns: 1`, no resume, no tools (the firewall base). */
export async function verifyAuth(req: VerifyAuthRequest, deps: AgentSdkDeps, log: AgentSdkLog): Promise<VerifyAuthResult> {
  const { connection } = req;
  const abortController = linkAbort(req.signal);
  const stream = deps.query({
    prompt: VERIFY_PROMPT,
    options: {
      ...disciplineOptions(deps.childEnv(connection)),
      ...observabilityOptions(deps.debug, log),
      model: connection.model,
      maxTurns: 1,
      ...(req.signal !== undefined ? { abortController } : {}),
    },
  });
  const { apiKeySource, reply, ok, costUsd } = await reduceVerifyStream(stream);
  const account = await probeAccountInfo(stream, deps);
  return { source: "max-pro-sub", ok, apiKeySource, model: connection.model, reply: reply.trim(), costUsd, ...(account !== undefined ? { account } : {}) };
}
