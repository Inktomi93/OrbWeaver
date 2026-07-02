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

import type { VerifyAuthResult } from "@orb/contracts/providers";
import type { VerifyAuthRequest } from "../../contract";
import { disciplineOptions, observabilityOptions } from "./translate";
import type { AgentSdkDeps } from "./types";
import { assertInitFrameShape } from "./verify";

/** The trivial probe prompt (one cheap turn; the reply pins the round-trip actually generated). */
const VERIFY_PROMPT = "Reply with exactly the two characters: ok";

/** Run the tiny auth-verify turn. `maxTurns: 1`, no resume, no tools (the firewall base). */
export async function verifyAuth(
  req: VerifyAuthRequest,
  deps: AgentSdkDeps,
): Promise<VerifyAuthResult> {
  const stream = deps.query({
    prompt: VERIFY_PROMPT,
    options: {
      ...disciplineOptions(req.credential),
      ...observabilityOptions(),
      model: req.model,
      maxTurns: 1,
    },
  });

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

  return {
    source: "max-pro-sub",
    ok,
    apiKeySource,
    model: req.model,
    reply: reply.trim(),
    costUsd,
  };
}
