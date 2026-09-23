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
//   8. the output-cap spelling: `features.outputCapField: "max_completion_tokens"` renames the SDK's `max_tokens`
//      (OpenAI's reasoning models 400 on the old word — inference audit H2, measured 2026-09-20). Never on the
//      openrouter dialect, which speaks OR's own body.
//   9. the cache-marker spelling (openrouter only): a message-level `cache_control` moves onto the row's last
//      text part. OpenRouter forwards a marker to Anthropic only from a content part and drops a message-level
//      one (measured: gen-1790134941-TdEvy3D9exFNfO6cf830 read only the system block; the content-part A/B,
//      gen-1790135929 vs gen-1790135933, read the history). The provider converter writes assistant and tool
//      rows as strings with a message-level marker, and the history breakpoints land on those rows. A row with
//      no text part (a tool-call row) passes its marker to the nearest earlier row with text.
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
const MAX_TOKENS_KEY = "max_tokens";
const MAX_COMPLETION_TOKENS_KEY = "max_completion_tokens";
const CONTINUE_FINAL_MESSAGE_KEY = "continue_final_message";
const ADD_GENERATION_PROMPT_KEY = "add_generation_prompt";
const MODALITIES_KEY = "modalities";
const REPLY_MODALITIES = ["text", "image"] as const;
const CHAT_TEMPLATE_KWARGS_KEY = "chat_template_kwargs";
const ENABLE_THINKING_KEY = "enable_thinking";
const IMAGE_URL_TYPE = "image_url";
const VIDEO_URL_TYPE = "video_url";
const TEXT_TYPE = "text";
const CACHE_CONTROL_KEY = "cache_control";

/** The keys the `openrouter` transport MODELS off `extras` — everything else is dropped loudly.
 *
 *  EVERY entry here is read, VALIDATED and placed by `openai-compat/chat.ts` (`openRouterExtras`,
 *  `mergePlugins`, `webSearchOptions`, `debugOptions`), which is why none of them is merged from here: the
 *  raw user value would overwrite the validated copy the chat surface already put on the body. The list's
 *  only job is deciding whether a key gets the "ignored" WARNING — and a key this transport DOES send must
 *  not claim it was dropped. `plugins`/`web_search_options` were missing when their doors landed (audit C3),
 *  so a user who declared either got a `settings_adjusted` notice about a field that rode the wire
 *  perfectly; `debug` (D3) would have inherited it. A new extras door adds its key HERE in the same commit. */
const OPENROUTER_EXTRAS_KEYS = ["provider", "models", "plugins", "web_search_options", "debug"] as const;

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
      // Every modelled key was already read, validated and placed by the chat surface; every other key has
      // no home on this transport. Either way nothing merges from here — see the list's own note.
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

/** Rule 8: the output cap under the word the server takes. The SDK always writes `max_tokens`; a row that
 *  declares `max_completion_tokens` gets it renamed, nothing else is touched. */
function applyOutputCapSpelling(body: Record<string, unknown>, args: ShapeArgs): Record<string, unknown> {
  if (args.dialect === "openrouter" || args.features.outputCapField !== MAX_COMPLETION_TOKENS_KEY || !(MAX_TOKENS_KEY in body)) {
    return body;
  }
  const { [MAX_TOKENS_KEY]: cap, ...rest } = body;
  return { ...rest, [MAX_COMPLETION_TOKENS_KEY]: cap };
}

function isTextPart(part: unknown): part is Record<string, unknown> {
  return isRecord(part) && part["type"] === TEXT_TYPE;
}

/** Rule 9, walked from the end. A message-level marker moves onto its row's last text part. A row with no text
 *  (an assistant tool-call row, `content: null`) cannot hold one — an empty text block with `cache_control` is
 *  refused — so its marker moves to the nearest EARLIER row with text: a shorter prefix of the same history,
 *  still a valid cache entry (measured: gen-1790145899-YEYx8CfmJdExgPTOB9u4 dropped, gen-1790145901-ZwS0tawK8pqSw284khqj
 *  forwarded). A row that already carries a part marker absorbs a moved one; two never stack. */
function applyCacheMarkerSpelling(body: Record<string, unknown>, args: ShapeArgs): Record<string, unknown> {
  const messages = body["messages"];
  if (args.dialect !== "openrouter" || !Array.isArray(messages)) {
    return body;
  }
  const out: unknown[] = [...messages];
  let pending: unknown;
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const message = out[i];
    if (!isRecord(message)) {
      continue;
    }
    const { [CACHE_CONTROL_KEY]: own, ...rest } = message;
    const marker = own ?? pending;
    if (marker === undefined) {
      continue;
    }
    const parts = contentParts(message["content"]);
    const last = parts.findLastIndex(isTextPart);
    if (last === -1) {
      out[i] = rest;
      pending = marker;
      continue;
    }
    pending = undefined;
    const marked = parts.some((part) => isTextPart(part) && part[CACHE_CONTROL_KEY] !== undefined);
    out[i] = marked
      ? { ...rest, content: parts }
      : { ...rest, content: parts.map((part, index) => (index === last && isTextPart(part) ? { ...part, [CACHE_CONTROL_KEY]: marker } : part)) };
  }
  return { ...body, messages: out };
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
  return applyCacheMarkerSpelling(applyOutputCapSpelling(applyEffortSpelling(body, args), args), args);
}
