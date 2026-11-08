// Recorded provider turns: the SSE `data:` payloads a real endpoint streamed, one step per request a journey makes.
// A step is keyed by its place in the journey, never by a request hash, so a prompt change keeps the tape valid.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isPlainObject } from "@orb/kit/guards";
import { z } from "zod";

/** The directory the committed tapes live in; a tape's name is its path below it, without `.json`. */
export const PROVIDER_TAPE_DIR = join(import.meta.dirname, "provider-tapes");

const tapeStepSchema = z.strictObject({
  /** The journey step that sends this request. */
  step: z.string().min(1),
  /** The request's `tools[].function.name` set, sorted: the replay refuses a request of another kind. */
  tools: z.array(z.string().min(1)),
  /** Each `data:` payload in arrival order, `[DONE]` excluded. */
  frames: z.array(z.string().min(1)).min(1),
});

const providerTapeSchema = z.strictObject({
  /** The upstream model the tape was recorded from. */
  model: z.string().min(1),
  steps: z.array(tapeStepSchema).min(1),
});

export type ProviderTapeStep = z.infer<typeof tapeStepSchema>;
export type ProviderTape = z.infer<typeof providerTapeSchema>;

function providerTapePath(name: string, dir: string = PROVIDER_TAPE_DIR): string {
  return join(dir, `${name}.json`);
}

/** Read and validate a committed tape. Every refusal names the tape, so a stale recording points at its own file. */
export function readProviderTape(name: string): ProviderTape {
  const path = providerTapePath(name);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`provider tape "${name}" (${path}) is not readable JSON`, { cause });
  }
  const parsed = providerTapeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`provider tape "${name}" (${path}) does not match the tape shape: ${z.prettifyError(parsed.error)}`);
  }
  for (const step of parsed.data.steps) {
    for (const [index, frame] of step.frames.entries()) {
      try {
        JSON.parse(frame);
      } catch (cause) {
        throw new Error(`provider tape "${name}" step "${step.step}" frame ${String(index)} is not JSON`, { cause });
      }
    }
  }
  return parsed.data;
}

/** Write a tape below `dir`; a recording run passes a gitignored directory, never the committed one. */
export function writeProviderTape(name: string, tape: ProviderTape, dir: string): void {
  const path = providerTapePath(name, dir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(providerTapeSchema.parse(tape), null, 2)}\n`);
}

// The shapes a provider or proxy echoes back: an OpenRouter, OpenAI or Anthropic key, or a bearer secret.
const KEY_SHAPES = [/\bsk-[A-Za-z0-9_-]{16,}/u, /\bBearer\s+[A-Za-z0-9._-]{16,}/u];
const URL_SHAPE = /\bhttps?:\/\/([^/\s"'\\:]+)/gu;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** What a tape must never hold: key-shaped strings and hosts other than loopback. Empty means the tape is clean. */
export function providerTapeLeaks(tape: ProviderTape): readonly string[] {
  const text = JSON.stringify(tape);
  const keys = KEY_SHAPES.flatMap((shape) => (shape.test(text) ? [`a key-shaped string (${shape.source})`] : []));
  const hosts = [...text.matchAll(URL_SHAPE)].map((match) => match[1] ?? "").filter((host) => !LOOPBACK_HOSTS.has(host));
  return [...keys, ...new Set(hosts.map((host) => `the non-loopback host ${host}`))];
}

function field(value: unknown, key: string): unknown {
  return isPlainObject(value) ? value[key] : undefined;
}

function stringField(value: unknown, key: string): Record<string, string> {
  const found = field(value, key);
  return typeof found === "string" ? { [key]: found } : {};
}

function listField(value: unknown, key: string): readonly unknown[] | undefined {
  const found = field(value, key);
  return Array.isArray(found) ? found : undefined;
}

function indexOf(value: unknown): number {
  const found = field(value, "index");
  return typeof found === "number" ? found : 0;
}

const USAGE_COUNTS = ["prompt_tokens", "completion_tokens", "total_tokens"] as const;
const FINISH_REASON = "finish_reason";
const TOOL_CALLS = "tool_calls";

/** One recorded chunk with only what a chat turn reads; identity, cost and routing fields are dropped. */
export function scrubTapeFrame(payload: string, model: string, toolCallIds: Map<string, string>): string {
  const chunk: unknown = JSON.parse(payload);
  const usage = field(chunk, "usage");
  const counts = USAGE_COUNTS.flatMap((key) => {
    const count = field(usage, key);
    return typeof count === "number" ? [[key, count] as const] : [];
  });
  return JSON.stringify({
    id: "tape",
    object: "chat.completion.chunk",
    created: 0,
    model,
    choices: (listField(chunk, "choices") ?? []).map((choice) => scrubChoice(choice, toolCallIds)),
    ...(counts.length === 0 ? {} : { usage: Object.fromEntries(counts) }),
  });
}

function scrubChoice(choice: unknown, toolCallIds: Map<string, string>): Record<string, unknown> {
  const delta = field(choice, "delta");
  const calls = listField(delta, TOOL_CALLS);
  const finish = field(choice, FINISH_REASON);
  return {
    index: indexOf(choice),
    delta: {
      ...stringField(delta, "role"),
      ...stringField(delta, "content"),
      ...stringField(delta, "reasoning"),
      ...(calls === undefined ? {} : { [TOOL_CALLS]: calls.map((call) => scrubToolCall(call, toolCallIds)) }),
    },
    [FINISH_REASON]: typeof finish === "string" ? finish : null,
  };
}

// A provider's tool-call id is a generation id; the replay needs only a stable one per call.
function scrubToolCall(call: unknown, toolCallIds: Map<string, string>): Record<string, unknown> {
  const rawId = field(call, "id");
  const fn = field(call, "function");
  let id: string | undefined;
  if (typeof rawId === "string") {
    id = toolCallIds.get(rawId) ?? `call_${String(toolCallIds.size + 1)}`;
    toolCallIds.set(rawId, id);
  }
  return {
    index: indexOf(call),
    ...(id === undefined ? {} : { id, type: "function" }),
    function: { ...stringField(fn, "name"), ...stringField(fn, "arguments") },
  };
}
