// The ALLOWLISTED Anthropic `providerOptions.anthropic` extras (audit C2) — the direct wire's twin of the
// openrouter transport's `provider`/`models` readers. A hosted row has no body hook, so before this file
// every `extras` key on an `anthropic` connection was dropped wholesale; six of them are real, modelled
// options the SDK already spells, and dropping them left the user's own connection unable to say things the
// API accepts.
//
// PRECEDENCE IS UNCHANGED (D143(b)/D156, F21): an allowlisted key is still BEHIND the belt. Nothing here can
// reach a knob the funnel owns (`thinking`, `effort`, `disableParallelToolUse`, `cacheControl`,
// `structuredOutputMode`, `sendReasoning`) — those are not in the allowlist at all, so a user cannot use an
// extras key to take a modelled decision away from the turn. Every other key is dropped LOUDLY with
// `custom_parameters_ignored{key}`, exactly as the openrouter transport drops its whole extras block.
//
// WHAT IS NOT EXPOSED, AND WHY (the three the SDK models and this file refuses):
//   • `mcpServers` — a URL-and-bearer-token list the PROVIDER connects out to on our behalf. That is an
//     egress decision and a second credential store, both of which are the deployment's to make, not a
//     connection row's; admitting it here would route around the egress belt by way of Anthropic.
//   • `container` — the code-execution sandbox and its skill list. Tool execution in this product happens
//     under the HOST principal in our own engine (D152); a provider-side executor is a different trust
//     model and is an owner fork, not an extras key.
//   • `toolStreaming` — streams partial tool INPUT, which our reducer has no part kind for (`tool-input-delta`
//     is dropped, audit E3). Exposing a toggle whose effect the reducer discards is a lie about the wire.
// All three are agent-shaped: they make the PROVIDER act, which is the one thing `anthropic-messages` is not
// for (§8.5 — the subscription wire is the agent path, and an API-key row has none).
//
// `contextManagement` IS exposed and never defaulted ON (C6's owner default: expose, off). We run our own
// compaction (`chat/verbs/compaction.ts`), so a server-side edit policy is a user's deliberate override of a
// house mechanism, not a default anybody should get by upgrading.

import { createHash } from "node:crypto";
import type { JSONObject } from "@ai-sdk/provider";
import type { UserId } from "@orb/kit/ids";
import { z } from "zod";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";

/** The keys a connection's `extras` may carry on this wire, each validated against the 4.0.58 dist's own
 *  `anthropicLanguageModelOptions` shape (`index.d.ts:219-360`). Open enums stay `z.string()` where the dist
 *  models an open one and are pinned where it models a closed one. */
const ANTHROPIC_EXTRAS_SCHEMAS = {
  /** `fast | standard` — the latency/price tier. */
  speed: z.enum(["fast", "standard"]),
  /** `us | global` — where inference may run. A data-residency choice, so a property of the connection. */
  inferenceGeo: z.enum(["us", "global"]),
  /** A token budget for a whole agentic TASK, which the API decrements across calls. */
  taskBudget: z.object({ type: z.literal("tokens"), total: z.number().int().positive(), remaining: z.number().int().nonnegative().optional() }),
  /** Server-side model fallbacks: `"default"`, or an ordered list the API tries when the primary is busy. */
  fallbacks: z.union([
    z.literal("default"),
    z.array(
      z.object({
        model: z.string().min(1),
        max_tokens: z.number().int().positive().optional(),
        speed: z.enum(["fast", "standard"]).optional(),
      }),
    ),
  ]),
  /** Server-side context edits (`clear_tool_uses` / `clear_thinking` / `compact`). EXPOSED, NEVER DEFAULTED. */
  // LOOSE on the edit bodies deliberately: the `type` discriminator is Anthropic's dated beta id
  // (`clear_tool_uses_20250919`, `compact_20260112`, …) and a new one ships without us. Pinning each body's
  // fields would refuse a valid edit the day the API adds one, for a block this layer only forwards.
  contextManagement: z.object({ edits: z.array(z.looseObject({ type: z.string().min(1) })).min(1) }),
} as const;

type AnthropicExtrasKey = keyof typeof ANTHROPIC_EXTRAS_SCHEMAS;

const ALLOWED_KEYS = Object.keys(ANTHROPIC_EXTRAS_SCHEMAS) as readonly AnthropicExtrasKey[];

/** The ABUSE-ATTRIBUTION id Anthropic asks for (`metadata.user_id`), and the reason it is NOT plumbed from
 *  `extras`: it is not a user preference, it is a fact about who is spending. Derived here from the
 *  connection's OWNER (the funder, §8.4-3) as a SHA-256 hex digest — the API's docs say an opaque
 *  identifier, and a raw `user_…` TypeID would hand a third party a stable handle that joins across every
 *  other surface of this product. The digest is stable per user (so Anthropic can correlate a repeat
 *  offender, which is the whole point) and reverses to nothing without our id space.
 *
 *  SALTED WITH A FIXED, NON-SECRET DOMAIN STRING, deliberately: a per-deployment secret would make the
 *  digest unstable across a restore and defeat the correlation the field exists for, while adding no real
 *  protection — the id space is 26 base32 characters, so a secret salt is the only thing that would stop a
 *  brute-force, and we are not trying to stop one. What we are stopping is the raw id leaving the box. */
const USER_ID_DIGEST_DOMAIN = "orbweaver:anthropic-metadata-user-id:v1";

/** The salted digest itself — the ONLY value that leaves the box for `metadata.userId`.
 *  @public Test-anchored module surface; focused tests pin its shape and its stability. */
export function anthropicUserIdDigest(ownerId: UserId): string {
  return createHash("sha256").update(`${USER_ID_DIGEST_DOMAIN}:${ownerId}`).digest("hex");
}

/** Fold a connection's `extras` into the allowlisted `providerOptions.anthropic` slice. Every key outside the
 *  allowlist — and every allowlisted key whose value does not parse — drops with `custom_parameters_ignored`,
 *  which is the same code and the same posture the openai-compatible belt uses for a rejected body key. */
export function anthropicExtras(connection: Resolved, warnings: ResolvedWarning[]): JSONObject {
  const out: JSONObject = { metadata: { userId: anthropicUserIdDigest(connection.ownerId) } };
  for (const [key, value] of Object.entries(connection.extras ?? {})) {
    const schema = ALLOWED_KEYS.includes(key as AnthropicExtrasKey) ? ANTHROPIC_EXTRAS_SCHEMAS[key as AnthropicExtrasKey] : undefined;
    if (schema === undefined) {
      warnings.push({
        code: "custom_parameters_ignored",
        key,
        message: `extras key "${key}" ignored: the anthropic wire takes ${ALLOWED_KEYS.join(", ")} and nothing else`,
      });
      continue;
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      warnings.push({ code: "custom_parameters_ignored", key, message: `extras key "${key}" ignored: the value is not a valid ${key} block` });
      continue;
    }
    out[key] = parsed.data as JSONObject[string];
  }
  return out;
}
