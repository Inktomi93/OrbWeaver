// The live agent-sdk model-catalog fetch (the daemon's `supportedModels()` control-channel call), under ONE
// user's connection (the daemon authenticates with that user's token). Opens a held-open streaming query
// through the firewall so the daemon initializes and answers without a billed turn, then interrupts it in
// `finally` under its OWN short deadline. Normalizes the SDK's `ModelInfo[]` into the SDK-free `AgentSdkModel[]`.
// Also the `verifyAuth` diagnostic — ONE trivial prompt through the SAME firewall a real turn uses.

import type { AccountInfo, ModelInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/inference";
import type { VerifyAuthAccount, VerifyAuthResult } from "@orb/contracts/providers";
import { errorMessage } from "@orb/kit/error-message";
import type { VerifyAuthRequest } from "../../contract/diagnostics.ts";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import { ProviderError } from "../../contract/errors.ts";
import { redactSecretsFromText } from "../kit/openai-body.ts";
import { resolvedScrubSet, sanitizeApiError } from "../kit/sanitize.ts";
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

/**
 * THE THIRD UPSTREAM-PROSE PATH (the other two are `providerErrorFromHttp` and `fetch-json.ts::safeErrorBody`),
 * and it composes its hygiene exactly like them. The SDK's own message is genuinely worth keeping — it is what
 * tells an operator the daemon refused, wedged or died — so it is SANITIZED, never stripped.
 *
 * ORDER (#1809): the by-value belt reads INTACT text and `sanitizeApiError` mangles what is left. Reversed,
 * the tag strip / control strip / whitespace collapse / 500-char cap can bite the subscription token in half,
 * after which neither of its spellings matches and the fragment rides `ProviderError.message` onward. There is
 * no #1820 over-read hop here because nothing truncates upstream of this: the SDK hands us a whole string.
 *
 * The raw thrown object does NOT survive as `cause`, for the reason `providerErrorFromHttp` states: an SDK
 * error can carry reflected bodies, argv and nested causes as enumerable fields that a later logger
 * serializes, and this boundary is credential-bearing by construction (the daemon spawns under the user's
 * token). A `ProviderError` we minted ourselves passes through untouched — its message is our own vocabulary.
 */
function discoveryError(err: unknown, secrets: ProviderScrubSet): ProviderError {
  if (err instanceof ProviderError) {
    return err;
  }
  const safe = sanitizeApiError(redactSecretsFromText(errorMessage(err), secrets));
  return new ProviderError({ kind: "server", retryable: true, message: `agent-sdk model discovery failed: ${safe}`, cause: new Error(safe) });
}

export async function fetchAgentSdkModels(connection: SpawnIdentity, deps: AgentSdkDeps, log: AgentSdkLog): Promise<AgentSdkModel[]> {
  // `transport: null` is a fact about this wire, not a convenience: the agent-sdk spawn authenticates ONLY
  // through `buildClaudeSdkEnv`'s token env (`index.ts::childEnv`) — there is no HTTP request here to carry a
  // user-authored auth header or a key-in-body field, which is why `SpawnIdentity` narrows to owner+credential.
  const secrets = resolvedScrubSet({ credential: connection.credential, transport: null });
  const stream: Query = deps.query({ prompt: heldOpenPrompt(), options: disciplineOptions(deps.childEnv(connection)) });
  try {
    const models = await withTimeout(stream.supportedModels(), deps, DISCOVERY_TIMEOUT_MS, "model discovery").catch((err: unknown) => {
      throw discoveryError(err, secrets);
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
