// infra/providers/backends/agent-sdk/catalog — the LIVE agent-sdk model-catalog fetch verb (the daemon's
// `supportedModels()` control-channel call). An I/O adapter mirroring `backends/openrouter/catalog.ts`:
// `connection.refreshAgentSdkCatalog` calls it THROUGH injection and owns the snapshot + the in-memory TTL
// cache (this returns the parsed rows; it holds no cache). Normalizes the SDK's `ModelInfo[]` into the
// cross-boundary SDK-FREE `AgentSdkModel[]` (the connection contract) so the SDK type never leaks upward.
//
// THE UNLOCK — near-zero-cost discovery: `supportedModels()` is a CONTROL-CHANNEL call to the live daemon,
// NOT a generation turn. We open a held-open STREAMING query (the prompt is an async generator that yields
// nothing and resolves after a short delay), let the daemon initialize, read its live family→version map,
// then `interrupt()` in `finally` so the never-yielded turn is torn down without a billed generation.
//
// FIREWALL: the spawn goes through the SAME mode-1 credential firewall (`buildClaudeSdkEnv` via
// `disciplineOptions` on the host-login `max-pro-sub` source) a real turn uses — no built-in tools, strict
// MCP, no settings. Discovery is a host-login concern; the daemon's model map is auth-agnostic, so the
// cheapest firewalled path (mode-1) is used regardless of the resolved chat source.
//
// ROBUSTNESS: a bounded timeout races the discovery so a wedged spawn can't hang the refresh; the interrupt
// runs in `finally` (torn down on success, timeout, or throw); any failure becomes a typed `ProviderError`
// and the connection refresh falls back to the persisted snapshot (mirrors `refreshCatalog`).

import type { ModelInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/connection";
import { ProviderError } from "../../contract";
import { buildClaudeSdkEnv } from "./env";
import { firewallBase } from "./translate";
import type { AgentSdkDeps } from "./types";

/** Bound the control-channel round-trip so a wedged spawn can't hang the refresh (measured near-instant
 *  in steady state; 15s is generous for a cold daemon boot). */
const DISCOVERY_TIMEOUT_MS = 15_000;

/** A never-yielding prompt that resolves after a microtask — holds the streaming query open just long
 *  enough for the daemon to initialize + answer `supportedModels()`, WITHOUT enqueuing a generation turn.
 *  The yield-less body is deliberate (an empty async iterable is the "held open, no turn" signal). */
// biome-ignore lint/correctness/useYield: an empty async generator IS the held-open no-turn prompt (see above).
async function* heldOpenPrompt(): AsyncGenerator<never> {
  await Promise.resolve();
}

/** Race a promise against a bounded timeout, rejecting with a typed `ProviderError` on expiry. The timer
 *  is always cleared (win OR loss) so a resolved discovery never leaves a dangling handle. */
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

/** Normalize one SDK `ModelInfo` → the SDK-free {@link AgentSdkModel}. Optional flags default falsy; the
 *  effort levels are the daemon's own `low..max` subset (already matching {@link EFFORT_LEVELS}, no
 *  `'none'`) so the array copies through verbatim. `resolvedModel` absent ⇒ `null` (the snapshot signal). */
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
 * Fetch + normalize the live agent-sdk model catalog via the daemon's `supportedModels()` control call.
 * Opens a held-open streaming query through the mode-1 firewall, reads the family→version map, interrupts
 * the never-started turn in `finally`, and returns the normalized {@link AgentSdkModel} rows. A spawn /
 * transport failure (or the discovery timeout) becomes a typed `ProviderError` — the connection refresh
 * catches it and serves the persisted snapshot (mirrors `fetchOrCatalog` + `refreshCatalog`).
 */
export async function fetchAgentSdkModels(deps: AgentSdkDeps): Promise<AgentSdkModel[]> {
  const stream: Query = deps.query({
    prompt: heldOpenPrompt(),
    // The mode-1 firewall: the leak-proof discipline base + the host-login (`buildClaudeSdkEnv`) env. The
    // daemon's model map is auth-agnostic, so discovery always rides the cheapest firewalled path.
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
    // Tear down the never-started turn so no generation is billed (best-effort — a failed interrupt on an
    // already-dead spawn is not actionable). The interrupt receipt is discarded (we started no turn).
    try {
      await stream.interrupt();
    } catch {
      // The spawn may already be gone (timeout/throw path); nothing to recover.
    }
  }
}
