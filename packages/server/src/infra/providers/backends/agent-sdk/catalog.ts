// The live agent-sdk model-catalog fetch verb (the daemon's `supportedModels()` control-channel call).
// Opens a held-open streaming query (never-yielding prompt) through the mode-1 firewall so the daemon
// initializes and answers without a billed generation turn, then interrupts it in `finally`. Normalizes
// the SDK's `ModelInfo[]` into the SDK-free `AgentSdkModel[]` connection contract.

import type { ModelInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/connection";
import { ProviderError } from "../../contract";
import { buildClaudeSdkEnv } from "./env";
import { firewallBase } from "./translate";
import type { AgentSdkDeps } from "./types";

const DISCOVERY_TIMEOUT_MS = 15_000;

// biome-ignore lint/correctness/useYield: an empty async generator IS the held-open no-turn prompt.
async function* heldOpenPrompt(): AsyncGenerator<never> {
  await Promise.resolve();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        // biome-ignore lint/style/useErrorCause: a timeout has no underlying error to chain — it IS the cause.
        new ProviderError({
          kind: "server",
          retryable: true,
          message: `agent-sdk model discovery timed out after ${ms}ms`,
        }),
      );
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
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

export async function fetchAgentSdkModels(deps: AgentSdkDeps): Promise<AgentSdkModel[]> {
  // Refresh an expired host token first so the daemon spawn authenticates.
  await deps.refreshHostSubToken();
  const stream: Query = deps.query({
    prompt: heldOpenPrompt(),
    options: { ...firewallBase(), env: buildClaudeSdkEnv() },
  });
  try {
    const models = await withTimeout(stream.supportedModels(), DISCOVERY_TIMEOUT_MS);
    return models.map(normalize);
  } catch (err) {
    if (err instanceof ProviderError) {
      throw err;
    }
    // biome-ignore lint/style/useErrorCause: cause IS chained below (`cause: err`) — the rule misses ProviderError's own cause-forwarding ctor.
    throw new ProviderError({
      kind: "server",
      retryable: true,
      message: `agent-sdk model discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      cause: err,
    });
  } finally {
    // Tear down the never-started turn so no generation is billed (best-effort).
    try {
      await stream.interrupt();
    } catch {
      // Spawn may already be gone.
    }
  }
}
