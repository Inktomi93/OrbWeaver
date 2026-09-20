// The assembled history → the Vercel V4 prompt the two hosted wires share (`openai-compat` + `anthropic-messages`
// hand the SDK the SAME `LanguageModelV4Prompt`; only the per-message `providerOptions` key differs). What the
// SDK converters DROP, and this file therefore RECORDS for the post-convert hooks (§8.0, verify4 H1) — shared by BOTH hosted wires, so it lives in `backends/v4/`, the hosted-wire kit beside `kit/`:
//   • an ASSISTANT `file` part — both converters switch on `text | reasoning | tool-call` with no `file` arm, so
//     a prior inline-reply image riding back (§6.7) is re-attached by `body.ts` from `WirePlan.assistantMedia`;
//   • the per-participant `name` — neither converter forwards it; `body.ts` writes it from `WirePlan.names`.
// Both are keyed by the WIRE-ARRAY index, which this file derives from its own walk (a `tool` row fans out to
// one wire message per `tool-result` part; every other row is 1:1; an empty row is DROPPED here, before the
// index is assigned, so the plan and the converted array agree by construction).
//
// The system prompt: the STATIC prefix + the DYNAMIC tail joined into the leading `system` row when the funnel
// resolved `system-block`; under `message-tail` the dynamic half rides a TRAILING `system` row (the
// mid-conversation channel, cache-safe — the static prefix stays cacheable). A capability-kept mid-history
// `system` row is delivered as a real system message (legal V4 vocabulary), never coerced to `user`.

import type { JSONObject, LanguageModelV4FilePart, LanguageModelV4Message, LanguageModelV4Prompt, SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { ChatContentPart, ReasoningPartMeta } from "@orb/contracts/chat";
import type { ChatHistoryMessage, HistoryRole } from "../../contract/chat.ts";
import type { DynamicContextChannel } from "../../contract/resolve.ts";
import { chatHistoryText } from "../kit/history.ts";

const PROMPT_JOINER = "\n\n";
const DATA_URL_RE = /^data:(?<mime>[^;,]+);base64,(?<data>.*)$/su;
const IMAGE_MEDIA = "image";
const VIDEO_MEDIA = "video";
/** The two converters' own `providerOptions` keys for a replayed reasoning part (§A1). Spelled here rather
 *  than imported from either transport: this file is the shared prompt builder and must not depend on a
 *  wire module (the dependency runs the other way). */
const ANTHROPIC_OPTIONS_KEY = "anthropic";
const OPENROUTER_OPTIONS_KEY = "openrouter";
const REASONING_DETAILS_KEY = "reasoning_details";

/** One outbound media part the converter can carry on a USER row, or that `body.ts` must re-attach on an
 *  ASSISTANT row: the resolved URL/data-URI the chat domain produced, tagged by kind. */
export interface OutboundMedia {
  readonly kind: "image" | "video";
  readonly url: string;
}

/** The prompt plus everything the SDK converters cannot carry, indexed by WIRE-ARRAY position. */
export interface WirePlan {
  readonly prompt: LanguageModelV4Prompt;
  /** Wire index → the participant label the view-builder stamped on that row. */
  readonly names: ReadonlyMap<number, string>;
  /** Wire index → the media parts of an ASSISTANT row (dropped by both converters — re-attached by the hook). */
  readonly assistantMedia: ReadonlyMap<number, readonly OutboundMedia[]>;
  /** Wire index → the row's cache-breakpoint eligibility inputs (role + tool-exchange + token estimate source). */
  readonly rows: readonly PlanRow[];
  /** True when at least one history `tool-result` carried `isError` — the OpenAI-shaped wires have no slot. */
  readonly toolResultErrorDropped: boolean;
  /** True when the delivered array ends on an assistant row — the prefill pair's second condition. */
  readonly endsOnAssistant: boolean;
}

/** One wire row as the cache placer sees it. `text` is the row's prose for the token estimate. */
interface PlanRow {
  readonly role: HistoryRole;
  readonly toolExchange: boolean;
  readonly text: string;
}

export interface BuildPromptArgs {
  readonly systemPrompt: { readonly static: string; readonly dynamic: string };
  readonly dynamicContextChannel: DynamicContextChannel;
  readonly history: readonly ChatHistoryMessage[];
  /** The `providerOptions` key the wire's converter reads per message (`openaiCompatible` / `openrouter` /
   *  `anthropic`) and a builder for a row's options from its `wireMeta` — the anthropic wire forwards
   *  `clearAt`/`effort`; the openai-compat wires forward nothing. */
  readonly rowOptions?: ((row: ChatHistoryMessage) => SharedV4ProviderOptions | undefined) | undefined;
  /** Deliver the static prefix and the dynamic tail as TWO leading system rows (the openrouter transport on an
   *  Anthropic model: the static row takes the cache breakpoint, the volatile tail stays outside it). Only
   *  meaningful under `system-block`; under `message-tail` the tail already rides its own row. */
  readonly splitSystem?: boolean | undefined;
}

function joinSystemPrompt(systemPrompt: { readonly static: string; readonly dynamic: string }): string {
  return [systemPrompt.static.trim(), systemPrompt.dynamic.trim()].filter((part) => part.length > 0).join(PROMPT_JOINER);
}

/** A resolved URL/data-URI → the V4 `file` part. A data URL is split so the converter labels it with ITS mime
 *  (the SDK re-encodes `data` parts with the resolved media type); an http(s) URL rides as a `url` part. */
export function mediaFilePart(media: OutboundMedia): LanguageModelV4FilePart {
  const match = DATA_URL_RE.exec(media.url);
  if (match?.groups !== undefined) {
    return { type: "file", mediaType: match.groups["mime"] ?? `${media.kind}/*`, data: { type: "data", data: match.groups["data"] ?? "" } };
  }
  return { type: "file", mediaType: media.kind === "image" ? IMAGE_MEDIA : VIDEO_MEDIA, data: { type: "url", url: new URL(media.url) } };
}

function mediaOf(content: readonly ChatContentPart[]): OutboundMedia[] {
  const out: OutboundMedia[] = [];
  for (const part of content) {
    if (part.type === "image" || part.type === "video") {
      out.push({ kind: part.type, url: part.url });
    }
  }
  return out;
}

/** A tool call's raw `arguments` JSON string → the V4 `input` object the converter re-stringifies. A string
 *  the model emitted that is not JSON rides as the raw string (the converter stringifies it, the model sees
 *  what it wrote — never a crash on a malformed emission). */
function toolInput(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function userMessage(row: ChatHistoryMessage, options: SharedV4ProviderOptions | undefined): LanguageModelV4Message | null {
  const parts: Extract<LanguageModelV4Message, { role: "user" }>["content"] = [];
  for (const part of row.content) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text });
    } else if (part.type === "image" || part.type === "video") {
      parts.push(mediaFilePart({ kind: part.type, url: part.url }));
    }
  }
  if (parts.length === 0 || (parts.length === 1 && parts[0]?.type === "text" && parts[0].text.trim().length === 0)) {
    return null;
  }
  return { role: "user", content: parts, ...(options !== undefined ? { providerOptions: options } : {}) };
}

/** A reasoning part's per-wire provenance → the PART-LEVEL `providerOptions` each converter reads:
 *  `anthropic` takes `signature`/`redactedData` (one of the two, else it drops the block with a warning);
 *  `openrouter` takes the `reasoning_details` list back under its snake_case wire name, which its converter
 *  finds through the part when the message carries none. Both keys ride together when both are known — a
 *  converter reads only its own and ignores the rest. */
function reasoningOptions(meta: ReasoningPartMeta | undefined): SharedV4ProviderOptions | undefined {
  if (meta === undefined) {
    return;
  }
  const anthropic: JSONObject = {
    ...(meta.anthropic?.signature !== undefined ? { signature: meta.anthropic.signature } : {}),
    ...(meta.anthropic?.redactedData !== undefined ? { redactedData: meta.anthropic.redactedData } : {}),
  };
  const options: SharedV4ProviderOptions = {
    ...(Object.keys(anthropic).length > 0 ? { [ANTHROPIC_OPTIONS_KEY]: anthropic } : {}),
    ...(meta.openrouter !== undefined ? { [OPENROUTER_OPTIONS_KEY]: { [REASONING_DETAILS_KEY]: [...meta.openrouter.reasoningDetails] } } : {}),
  };
  return Object.keys(options).length > 0 ? options : undefined;
}

function assistantMessage(row: ChatHistoryMessage, options: SharedV4ProviderOptions | undefined): LanguageModelV4Message | null {
  const parts: Extract<LanguageModelV4Message, { role: "assistant" }>["content"] = [];
  let hasSubstance = false;
  for (const part of row.content) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text });
      hasSubstance ||= part.text.trim().length > 0;
    } else if (part.type === "reasoning") {
      // Deliberately NOT substance: a row carrying only replayed thinking is not a turn, and sending one
      // alone would be a thinking block with nothing it justifies.
      const reasoningMeta = reasoningOptions(part.meta);
      parts.push({ type: "reasoning", text: part.text, ...(reasoningMeta !== undefined ? { providerOptions: reasoningMeta } : {}) });
    } else if (part.type === "tool-call") {
      parts.push({ type: "tool-call", toolCallId: part.toolCallId, toolName: part.name, input: toolInput(part.arguments) });
      hasSubstance = true;
    } else if (part.type === "image" || part.type === "video") {
      // Recorded on the plan for the re-attach hook; the converter would drop the part (§8.0).
      hasSubstance = true;
    }
  }
  if (!hasSubstance) {
    return null;
  }
  return { role: "assistant", content: parts, ...(options !== undefined ? { providerOptions: options } : {}) };
}

/** One `tool` wire message per `tool-result` part. `isError` maps to the V4 `error-text` output — the
 *  anthropic converter spells it `is_error`; the OpenAI-shaped converters flatten it (recorded on the plan). */
function toolMessages(row: ChatHistoryMessage): LanguageModelV4Message[] {
  const out: LanguageModelV4Message[] = [];
  for (const part of row.content) {
    if (part.type === "tool-result") {
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: "",
            output: { type: part.isError === true ? "error-text" : "text", value: part.content },
          },
        ],
      });
    }
  }
  return out;
}

interface PlanBuilder {
  readonly prompt: LanguageModelV4Message[];
  readonly names: Map<number, string>;
  readonly assistantMedia: Map<number, readonly OutboundMedia[]>;
  readonly rows: PlanRow[];
}

function pushRow(builder: PlanBuilder, message: LanguageModelV4Message, row: PlanRow, source?: ChatHistoryMessage): void {
  const index = builder.prompt.length;
  builder.prompt.push(message);
  builder.rows.push(row);
  if (source?.name !== undefined && (row.role === "user" || row.role === "assistant")) {
    builder.names.set(index, source.name);
  }
  if (source !== undefined && row.role === "assistant") {
    const media = mediaOf(source.content);
    if (media.length > 0) {
      builder.assistantMedia.set(index, media);
    }
  }
}

function pushHistoryRow(builder: PlanBuilder, row: ChatHistoryMessage, options: SharedV4ProviderOptions | undefined): void {
  const text = chatHistoryText(row.content);
  if (row.role === "tool") {
    for (const message of toolMessages(row)) {
      pushRow(builder, message, { role: "tool", toolExchange: true, text });
    }
    return;
  }
  if (row.role === "system") {
    if (text.trim().length > 0) {
      pushRow(
        builder,
        { role: "system", content: text, ...(options !== undefined ? { providerOptions: options } : {}) },
        { role: "system", toolExchange: false, text },
      );
    }
    return;
  }
  if (row.role === "assistant") {
    const message = assistantMessage(row, options);
    if (message !== null) {
      const toolExchange = row.content.some((part) => part.type === "tool-call");
      pushRow(builder, message, { role: "assistant", toolExchange, text }, row);
    }
    return;
  }
  const message = userMessage(row, options);
  if (message !== null) {
    pushRow(builder, message, { role: "user", toolExchange: false, text }, row);
  }
}

/** Build the V4 prompt + the plan (see the header). Empty rows are dropped BEFORE indexing. */
export function buildWirePlan(args: BuildPromptArgs): WirePlan {
  const builder: PlanBuilder = { prompt: [], names: new Map(), assistantMedia: new Map(), rows: [] };
  const staticText = args.systemPrompt.static.trim();
  const dynamicText = args.systemPrompt.dynamic.trim();
  const tail = args.dynamicContextChannel === "message-tail" && dynamicText.length > 0;
  const split = args.splitSystem === true && !tail && staticText.length > 0 && dynamicText.length > 0;
  const leading = tail || split ? staticText : joinSystemPrompt(args.systemPrompt);
  if (leading.length > 0) {
    pushRow(builder, { role: "system", content: leading }, { role: "system", toolExchange: false, text: leading });
  }
  if (split) {
    pushRow(builder, { role: "system", content: dynamicText }, { role: "system", toolExchange: false, text: dynamicText });
  }
  for (const row of args.history) {
    pushHistoryRow(builder, row, args.rowOptions?.(row));
  }
  if (tail) {
    pushRow(builder, { role: "system", content: dynamicText }, { role: "system", toolExchange: false, text: dynamicText });
  }
  const last = builder.rows.at(-1);
  return {
    prompt: builder.prompt,
    names: builder.names,
    assistantMedia: builder.assistantMedia,
    rows: builder.rows,
    toolResultErrorDropped: args.history.some((row) => row.content.some((part) => part.type === "tool-result" && part.isError === true)),
    endsOnAssistant: last !== undefined && last.role === "assistant" && !last.toolExchange,
  };
}

/** Stamp a per-message `providerOptions[key]` field onto the plan's prompt at the given wire indices — the
 *  cache placer's writer (both hosted wires read `cacheControl` off the MESSAGE's options). Returns a NEW
 *  prompt; the plan's indices are unchanged. */
export function withMessageOptions(prompt: LanguageModelV4Prompt, key: string, patches: ReadonlyMap<number, Record<string, unknown>>): LanguageModelV4Prompt {
  if (patches.size === 0) {
    return prompt;
  }
  return prompt.map((message, index) => {
    const patch = patches.get(index);
    if (patch === undefined) {
      return message;
    }
    const existing = message.providerOptions?.[key] ?? {};
    return { ...message, providerOptions: { ...message.providerOptions, [key]: { ...existing, ...patch } } } as LanguageModelV4Message;
  });
}
