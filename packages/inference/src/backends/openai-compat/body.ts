// The OUTBOUND-BODY shaper — the one place the converted wire object is edited after every SDK write and
// before serialisation (§8.1). Applied through `transformRequestBody` on the `openai-compatible` transport
// and inside `wrapFetch` on the `openrouter` transport (the OR provider exposes no post-convert hook, so its
// body is parsed once there); the RULES are identical, only the hook differs:
//   1. `extras` merge (D143(b)/D156, MODELLED WINS): a belt-owned key (`BELT_OWNED_BODY_KEYS`) or a key that
//      collides with a modelled param is DROPPED with `custom_parameters_ignored{key}`; the openrouter
//      transport reads only its two modelled keys (`provider`, `models`) off extras and drops the rest.
//   2. `transport.includeBody` / `excludeBody` — the endpoint's final word, applied AFTER extras (§8.1).
//   3. the assistant-image re-attachment (§8.0, verify4 H1): both converters drop an assistant `file` part.
//   4. the per-participant `name` (neither converter forwards it).
//   5. the prefill pair (`continue_final_message` + `add_generation_prompt: false`) when the row's folded
//      `features.prefill` is `continue-final-message`, the capability says `assistantPrefill`, and the array
//      actually ends on an assistant row; `prefillSuppressesThinking` strips the thinking toggle then.
//   6. `modalities: ["text","image"]` when the funnel resolved `replyImages` (§6.7).
//   7. the effort spelling: `features.effort: "none"` strips the SDK's `reasoning_effort` with `effort_dropped`.
// Warnings are collected on a per-call sink the caller folds into the turn's `warning` events (D41).

import type { Dialect, EndpointFeatures } from "@orb/contracts/inference";
import { isBeltOwnedBodyKey } from "@orb/contracts/inference";
import { deepMergeRequestBody } from "@orb/kit/custom-parameters";
import type { JsonValue } from "@orb/kit/json";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { ConnectionTransport } from "../../contract/resolved.ts";
import { applyIncludeExclude } from "../kit/openai-body.ts";
import type { OutboundMedia, WirePlan } from "../v4/prompt.ts";

const REASONING_EFFORT_KEY = "reasoning_effort";
const CONTINUE_FINAL_MESSAGE_KEY = "continue_final_message";
const ADD_GENERATION_PROMPT_KEY = "add_generation_prompt";
const MODALITIES_KEY = "modalities";
const REPLY_MODALITIES = ["text", "image"] as const;
const CHAT_TEMPLATE_KWARGS_KEY = "chat_template_kwargs";
const ENABLE_THINKING_KEY = "enable_thinking";
const IMAGE_URL_TYPE = "image_url";
const VIDEO_URL_TYPE = "video_url";
const TEXT_TYPE = "text";

/** The keys the `openrouter` transport MODELS off `extras` — everything else is dropped loudly. */
const OPENROUTER_EXTRAS_KEYS = ["provider", "models"] as const;

export interface ShapeArgs {
  readonly plan: WirePlan | null;
  readonly features: EndpointFeatures;
  readonly extras: Readonly<Record<string, JsonValue>> | null;
  readonly transport: ConnectionTransport | null;
  /** `openai-compatible` merges every non-belt, non-colliding extras key; `openrouter` takes its two. */
  readonly dialect: Dialect;
  /** The capability half of the prefill decision (`acceptsAssistantPrefill`); the array half is the plan's. */
  readonly prefillAllowed: boolean;
  readonly replyImages: boolean;
  readonly warnings: ResolvedWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeExtras(body: Record<string, unknown>, args: ShapeArgs): Record<string, unknown> {
  if (args.extras === null) {
    return body;
  }
  // Collect the admitted keys, then merge through the Layer-2 prototype-pollution defense — a raw spread
  // of user-authored extras is exactly the hole `deepMergeRequestBody` exists to close (its header).
  const admitted: Record<string, unknown> = {};
  const modelled = args.dialect === "openrouter" ? new Set<string>(OPENROUTER_EXTRAS_KEYS) : null;
  for (const [key, value] of Object.entries(args.extras)) {
    if (modelled !== null) {
      // The two modelled keys were already read off `extras` by the chat surface (routing + fallback chain);
      // every other key has no home on this transport.
      if (!modelled.has(key)) {
        args.warnings.push({
          code: "custom_parameters_ignored",
          key,
          message: `extras key "${key}" ignored: the openrouter transport takes only ${[...modelled].join(", ")}`,
        });
      }
      continue;
    }
    if (isBeltOwnedBodyKey(key)) {
      args.warnings.push({ code: "custom_parameters_ignored", key, message: `extras key "${key}" ignored: the wire owns it` });
      continue;
    }
    if (key in body && body[key] !== undefined) {
      args.warnings.push({ code: "custom_parameters_ignored", key, message: `extras key "${key}" ignored: the modelled value wins (D143(b))` });
      continue;
    }
    admitted[key] = value;
  }
  return deepMergeRequestBody(body, admitted);
}

function mediaPart(media: OutboundMedia): Record<string, unknown> {
  return media.kind === "image" ? { type: IMAGE_URL_TYPE, image_url: { url: media.url } } : { type: VIDEO_URL_TYPE, video_url: { url: media.url } };
}

/** The converted row's content as a parts array so media can be appended: a non-empty string becomes one
 *  text part, an array is kept, anything else (null content on a tool-call-only row) starts empty. */
function contentParts(content: unknown): unknown[] {
  if (typeof content === "string") {
    return content.length > 0 ? [{ type: TEXT_TYPE, text: content }] : [];
  }
  return Array.isArray(content) ? content : [];
}

function patchRow(message: unknown, name: string | undefined, media: readonly OutboundMedia[] | undefined): unknown {
  if (!isRecord(message) || (name === undefined && media === undefined)) {
    return message;
  }
  const content = media === undefined ? message["content"] : [...contentParts(message["content"]), ...media.map(mediaPart)];
  return { ...message, content, ...(name !== undefined ? { name } : {}) };
}

/** Rule 3 + 4: walk the converted `messages[]` by the plan's wire index. Guarded on array length — a converter
 *  that ever merged or split a row would misalign every later index, so a mismatch applies NOTHING and warns
 *  rather than stamping a name or a picture on the wrong row. */
function reattachRows(body: Record<string, unknown>, plan: WirePlan, warnings: ResolvedWarning[]): Record<string, unknown> {
  const messages = body["messages"];
  if (!Array.isArray(messages) || (plan.names.size === 0 && plan.assistantMedia.size === 0)) {
    return body;
  }
  if (messages.length !== plan.rows.length) {
    warnings.push({
      code: "image_edit_dropped",
      message: `assistant media/name re-attachment skipped: the converter emitted ${messages.length} rows for ${plan.rows.length} planned`,
    });
    return body;
  }
  return { ...body, messages: messages.map((message: unknown, index: number) => patchRow(message, plan.names.get(index), plan.assistantMedia.get(index))) };
}

/** Rule 5: the prefill pair, and the measured vLLM interlock (`prefillSuppressesThinking`, §8.1). */
function applyPrefill(body: Record<string, unknown>, args: ShapeArgs): Record<string, unknown> {
  if (args.plan === null || args.features.prefill !== "continue-final-message" || !args.prefillAllowed || !args.plan.endsOnAssistant) {
    return body;
  }
  const out: Record<string, unknown> = { ...body, [CONTINUE_FINAL_MESSAGE_KEY]: true, [ADD_GENERATION_PROMPT_KEY]: false };
  if (args.features.prefillSuppressesThinking !== true) {
    return out;
  }
  const kwargs = out[CHAT_TEMPLATE_KWARGS_KEY];
  const thinkingOn = !(isRecord(kwargs) && kwargs[ENABLE_THINKING_KEY] === false);
  if (thinkingOn) {
    args.warnings.push({
      code: "reasoning_dropped_for_prefill",
      message: "thinking disabled for this turn: a content prefill with thinking on yields an empty reply on this server",
    });
    out[CHAT_TEMPLATE_KWARGS_KEY] = { ...(isRecord(kwargs) ? kwargs : {}), [ENABLE_THINKING_KEY]: false };
    delete out[REASONING_EFFORT_KEY];
  }
  return out;
}

/** Rule 7: an effort the SDK spelled onto a server whose row says it has no effort field. */
function applyEffortSpelling(body: Record<string, unknown>, args: ShapeArgs): Record<string, unknown> {
  if (args.dialect === "openrouter" || args.features.effort === "reasoning_effort" || body[REASONING_EFFORT_KEY] === undefined) {
    return body;
  }
  args.warnings.push({ code: "effort_dropped", message: "effort ignored: this endpoint's row spells no reasoning-effort field" });
  const { [REASONING_EFFORT_KEY]: _dropped, ...rest } = body;
  return rest;
}

/** The whole shaper, in rule order. Pure: returns a new object, never mutates the SDK's argument. */
export function shapeOutboundBody(raw: Record<string, unknown>, args: ShapeArgs): Record<string, unknown> {
  let body = mergeExtras(raw, args);
  body = applyIncludeExclude(body, args.transport?.includeBody ?? null, args.transport?.excludeBody ?? null);
  if (args.plan !== null) {
    body = reattachRows(body, args.plan, args.warnings);
  }
  body = applyPrefill(body, args);
  if (args.replyImages) {
    body = { ...body, [MODALITIES_KEY]: [...REPLY_MODALITIES] };
  }
  return applyEffortSpelling(body, args);
}
