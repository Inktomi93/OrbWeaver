// The live agent-sdk model-catalog fetch (the daemon's `supportedModels()` control-channel call), under ONE
// user's connection (the daemon authenticates with that user's token). Opens a held-open streaming query
// through the firewall so the daemon initializes and answers without a billed turn, then interrupts it in
// `finally` under its OWN short deadline. Normalizes the SDK's `ModelInfo[]` into the SDK-free `AgentSdkModel[]`.
// Also the `verifyAuth` diagnostic — ONE trivial prompt through the SAME firewall a real turn uses.

import type { ModelInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/inference";
import { agentSdkModelSchema } from "@orb/contracts/inference";
import type { VerifyAuthAccount, VerifyAuthResult } from "@orb/contracts/providers";
import { verifyAuthAccountSchema } from "@orb/contracts/providers";
import { errorMessage } from "@orb/kit/error-message";
import type { AgentSdkQueryLease, DiagnosticRequestCommon, ProviderScrubSet, SpawnIdentity } from "#contract";
import { ProviderError } from "#contract";
import type { AgentSdkDeps, AgentSdkLog } from "#src/contract/agent-sdk-backend.ts";
import { resolvedScrubSet, sanitizeApiError } from "../http/sanitize.ts";
import { redactSecretsFromText } from "../wire/openai-body.ts";
import { disciplineOptions } from "./translate.ts";
import { assertSdkMessageRead, isQueryAbort } from "./wire-read.ts";

const DISCOVERY_TIMEOUT_MS = 15_000;
/** The teardown's own bound: a daemon wedged on `supportedModels()` may never answer `interrupt()` either. */
const INTERRUPT_TIMEOUT_MS = 2000;
const VERIFY_PROMPT = "Reply with exactly the two characters: ok";
const ACCOUNT_INFO_PROBE_TIMEOUT_MS = 2000;

// An empty async generator IS the held-open no-turn prompt.
async function* heldOpenPrompt(): AsyncGenerator<never> {
  await Promise.resolve();
  yield* [];
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

/** Native exit faults use the owned diagnostic projection because vendor text may contain truncated credentials.
 * Keep trusted provider classifications intact and reconstruct causes rather than retaining raw SDK objects. */
function queryError(err: unknown, secrets: ProviderScrubSet, safeErrorMessage: AgentSdkQueryLease["safeErrorMessage"], operation: string): ProviderError {
  if (err instanceof ProviderError) {
    return err;
  }
  const safe = sanitizeApiError(redactSecretsFromText(safeErrorMessage(err), secrets));
  if (isQueryAbort(err)) {
    return new ProviderError({ kind: "aborted", retryable: false, message: `agent-sdk ${operation} was cancelled`, cause: new Error(safe) });
  }
  return new ProviderError({ kind: "server", retryable: true, message: `agent-sdk ${operation} failed: ${safe}`, cause: new Error(safe) });
}

export async function fetchAgentSdkModels(connection: SpawnIdentity, deps: AgentSdkDeps, log: AgentSdkLog): Promise<AgentSdkModel[]> {
  // `transport: null` is a fact about this wire, not a convenience: the agent-sdk spawn authenticates ONLY
  // through `buildClaudeSdkEnv`'s token env (`index.ts::childEnv`) — there is no HTTP request here to carry a
  // user-authored auth header or a key-in-body field, which is why `SpawnIdentity` narrows to owner+credential.
  const secrets = resolvedScrubSet({ credential: connection.credential, transport: null });
  await using lease = deps.execution.open(connection, { prompt: heldOpenPrompt(), options: disciplineOptions(deps.childEnv(connection)) });
  const stream = lease.query;
  try {
    const models = await withTimeout(stream.supportedModels(), deps, DISCOVERY_TIMEOUT_MS, "model discovery").catch(async (err: unknown) => {
      await lease[Symbol.asyncDispose]();
      throw queryError(err, secrets, lease.safeErrorMessage, "model discovery");
    });
    return agentSdkModelSchema.array().parse(models.map(normalize));
  } finally {
    // Billing cleanup for a turn that never started — best-effort AND BOUNDED; logged, never thrown.
    try {
      await withTimeout(stream.interrupt(), deps, INTERRUPT_TIMEOUT_MS, "discovery turn teardown");
      // the catch logs a structured warning with the scrubbed teardown error (`log.warn` at catalog.ts:83); the discovery result or primary failure stays authoritative. Ends if that warning is removed.
    } catch (err) {
      log.warn({ err: new Error(lease.safeErrorMessage(err)) }, "agent-sdk model discovery: turn teardown did not complete — the spawn may already be gone");
    }
  }
}
async function reduceVerifyStream(stream: Query): Promise<Pick<VerifyAuthResult, "apiKeySource" | "reply" | "ok" | "costUsd">> {
  let apiKeySource = "unknown";
  let reply = "";
  let ok = false;
  let costUsd = 0;
  for await (const message of stream) {
    assertSdkMessageRead(message);
    if (message.type === "system" && message.subtype === "init") {
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

/** Best-effort account-identity probe against the LIVE query handle, bounded; only an abort rejects. */
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
    account = info !== undefined ? verifyAuthAccountSchema.parse(info) : undefined;
  } catch (error) {
    // An abort is the query ending and propagates. Everything else stays contained by design: the SDK exports only its
    // abort class, and a failed control call rejects with a plain Error, so no class exists to narrow to. Account
    // identity is an optional verify diagnostic outside the auth verdict, so the failure is logged and reads as none.
    if (isQueryAbort(error)) {
      throw error;
    }
    deps.log.warn({ err: errorMessage(error) }, "agent-sdk: the account-identity probe failed; verify reports no account");
  } finally {
    cancel?.();
  }
  return account;
}

/** The subscription auth verify: `maxTurns: 1`, no resume, no tools (the firewall base). */
export async function verifyAuth(req: DiagnosticRequestCommon, deps: AgentSdkDeps): Promise<VerifyAuthResult> {
  const { connection } = req;
  await using lease = deps.execution.open(
    connection,
    {
      prompt: VERIFY_PROMPT,
      options: {
        ...disciplineOptions(deps.childEnv(connection)),
        model: connection.model,
        maxTurns: 1,
      },
    },
    req.signal,
  );
  const stream = lease.query;
  const scrub = resolvedScrubSet({ credential: connection.credential, transport: null });
  let result: Awaited<ReturnType<typeof reduceVerifyStream>>;
  try {
    result = await reduceVerifyStream(stream);
  } catch (error) {
    await lease[Symbol.asyncDispose]();
    throw queryError(error, scrub, lease.safeErrorMessage, "verification");
  }
  const { apiKeySource, reply, ok, costUsd } = result;
  let account: VerifyAuthAccount | undefined;
  try {
    account = await probeAccountInfo(stream, deps);
  } catch (error) {
    throw queryError(error, scrub, lease.safeErrorMessage, "verification");
  }
  return { ok, apiKeySource, reply: reply.trim(), costUsd, ...(account !== undefined ? { account } : {}) };
}
