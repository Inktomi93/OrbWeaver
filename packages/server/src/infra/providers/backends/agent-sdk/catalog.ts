// The live agent-sdk model-catalog fetch verb (the daemon's `supportedModels()` control-channel call).
// Opens a held-open streaming query (never-yielding prompt) through the mode-1 firewall so the daemon
// initializes and answers without a billed generation turn, then interrupts it in `finally` under its OWN short
// deadline (a bound whose cleanup is unbounded is not a bound). Normalizes the SDK's `ModelInfo[]` into
// the SDK-free `AgentSdkModel[]` connection contract.

import type { ModelInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/connection";
import { getLog } from "#foundation/observability";
import { ProviderError } from "../../contract/index.ts";
import { buildClaudeSdkEnv } from "./env.ts";
import { firewallBase } from "./translate.ts";
import type { AgentSdkDeps } from "./types.ts";

const DISCOVERY_TIMEOUT_MS = 15_000;
/** The TEARDOWN's own bound. The `finally` interrupt is billing cleanup for a turn that never started, and a
 *  daemon wedged on `supportedModels()` is exactly the daemon whose `interrupt()` may never answer either —
 *  awaiting it unbounded made the 15 s discovery deadline above a fiction, because the caller then stayed
 *  pending on the CLEANUP. Short on purpose: nothing downstream reads the interrupt's result, so the cost of
 *  giving up on it is a subprocess the OS reaps, while the cost of not giving up is an unbounded hang. */
const INTERRUPT_TIMEOUT_MS = 2000;

// biome-ignore lint/correctness/useYield: an empty async generator IS the held-open no-turn prompt.
async function* heldOpenPrompt(): AsyncGenerator<never> {
  await Promise.resolve();
}

/** Race `promise` against a real-time deadline. `what` NAMES the operation in the refusal, so the discovery
 *  call and its teardown can never report each other's timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new ProviderError({
          kind: "server",
          retryable: true,
          message: `agent-sdk ${what} timed out after ${ms}ms`,
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
    const models = await withTimeout(stream.supportedModels(), DISCOVERY_TIMEOUT_MS, "model discovery");
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
    // Tear down the never-started turn so no generation is billed — best-effort AND BOUNDED. A failed or
    // timed-out teardown is LOGGED on the governed operator stream, never thrown: it is billing cleanup, and
    // the caller's answer is the discovery result (or the discovery error the outer catch already propagated)
    // either way. The bound is what stops a wedged `interrupt()` from outliving the deadline the discovery
    // call above advertises. The former `@orb-gate-ignore(empty:catch)` is GONE because it no longer applies:
    // the arm now owns its failure through `getLog()`, which is the gate's own accepted owner.
    try {
      await withTimeout(stream.interrupt(), INTERRUPT_TIMEOUT_MS, "discovery turn teardown");
    } catch (err) {
      getLog().warn({ err }, "agent-sdk model discovery: turn teardown did not complete — the spawn may already be gone");
    }
  }
}
