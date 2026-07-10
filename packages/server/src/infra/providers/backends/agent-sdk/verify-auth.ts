// infra/providers/backends/agent-sdk/verify-auth — the host-Claude AUTH VERIFY diagnostic (the
// `ProviderBackend.verifyAuth` impl behind `connection.testClaudeAuth`). Sends ONE trivial prompt through
// the SAME credential firewall a real turn uses (`disciplineOptions(req.credential)` — the max-pro-sub arm
// is `buildClaudeSdkEnv`, the host-login path) and reports which credential the spawned runtime actually
// used: `apiKeySource === "none"` is the healthy Max-sub answer (host login active); an unexpected key
// name is the env-leak canary. Neo parity (`providers/claude-sdk/verify.ts`), reshaped onto orbweaver's
// injected-`query` seam + the USER-vocab `VerifyAuthResult` (`source: "max-pro-sub"`, never a runner name).
//
// Deliberately NOT the turn reducer: no session resume (a health probe must not touch the per-chat
// prompt-cache lineage), no delta streaming, no warning plumbing — a linear frame read (init → assistant →
// result). An SDK-level throw propagates (the caller sees the transport error verbatim); a clean-but-failed
// turn reports `ok: false` (the result frame's `is_error`), never a fake success.

import type { AccountInfo, Query } from "@anthropic-ai/claude-agent-sdk";
import type { VerifyAuthAccount, VerifyAuthResult } from "@orb/contracts/providers";
import type { VerifyAuthRequest } from "../../contract";
import { disciplineOptions, observabilityOptions } from "./translate";
import type { AgentSdkDeps } from "./types";
import { assertInitFrameShape } from "./verify";

/** The trivial probe prompt (one cheap turn; the reply pins the round-trip actually generated). */
const VERIFY_PROMPT = "Reply with exactly the two characters: ok";

/** The best-effort `accountInfo()` probe budget (ms). A hung control call must NEVER stall the health
 *  probe — past this the identity enrichment is simply absent. */
const ACCOUNT_INFO_PROBE_TIMEOUT_MS = 2000;

/** Run the tiny auth-verify turn. `maxTurns: 1`, no resume, no tools (the firewall base). */
export async function verifyAuth(
  req: VerifyAuthRequest,
  deps: AgentSdkDeps,
): Promise<VerifyAuthResult> {
  const stream = deps.query({
    prompt: VERIFY_PROMPT,
    options: {
      // The auth-verify probe is the max-pro-sub (mode-1) path — no OR-skin tier map applies.
      ...disciplineOptions(req.credential, undefined),
      ...observabilityOptions(),
      model: req.model,
      maxTurns: 1,
    },
  });

  const { apiKeySource, reply, ok, costUsd } = await reduceVerifyStream(stream);

  // The stream drained and the Query is still open — enrich with the account identity/plan metadata via
  // the bounded, totally non-fatal `accountInfo()` probe. A failure/timeout ⇒ `account` absent; the health
  // probe NEVER fails or delays on this diagnostic.
  const account = await probeAccountInfo(stream);

  return {
    source: "max-pro-sub",
    ok,
    apiKeySource,
    model: req.model,
    reply: reply.trim(),
    costUsd,
    ...(account !== undefined ? { account } : {}),
  };
}

/** The linear frame read (init → assistant → result) of the verify turn — split from {@link verifyAuth}
 *  so the enrichment + assembly stays under the cognitive-complexity budget. */
async function reduceVerifyStream(
  stream: Query,
): Promise<{ apiKeySource: string; reply: string; ok: boolean; costUsd: number }> {
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

/** Map the SDK's `accountInfo()` response onto the SDK-FREE {@link VerifyAuthAccount} contract shape (the
 *  identity/plan fields; the SDK's `tokenSource`/`apiKeySource` internals are NOT surfaced — the healthy
 *  key-source answer already rides the result's top-level `apiKeySource`). */
function toVerifyAuthAccount(info: AccountInfo): VerifyAuthAccount {
  return {
    ...(info.email !== undefined ? { email: info.email } : {}),
    ...(info.organization !== undefined ? { organization: info.organization } : {}),
    ...(info.subscriptionType !== undefined ? { subscriptionType: info.subscriptionType } : {}),
    ...(info.apiProvider !== undefined ? { apiProvider: info.apiProvider } : {}),
  };
}

/**
 * Best-effort account-identity probe against the LIVE {@link Query} handle. BOUNDED
 * ({@link ACCOUNT_INFO_PROBE_TIMEOUT_MS}) and TOTALLY non-fatal: a throw, rejection, or hang past the bound
 * all resolve `undefined` (⇒ `account` absent). A hand-built test stream is not a real `Query` (no
 * `accountInfo`), so the method presence is guarded first.
 */
async function probeAccountInfo(query: Query): Promise<VerifyAuthAccount | undefined> {
  if (typeof query.accountInfo !== "function") {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ACCOUNT_INFO_PROBE_TIMEOUT_MS);
    timer.unref?.();
  });
  let account: VerifyAuthAccount | undefined;
  try {
    const info = await Promise.race([query.accountInfo(), timeout]);
    account = info !== undefined ? toVerifyAuthAccount(info) : undefined;
  } catch {
    // A rejected control call is a diagnostic miss, never a probe failure — leave `account` absent.
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
  return account;
}
