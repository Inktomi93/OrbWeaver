// OR-11 — does a model OBEY a system row at depth 2 in its legal slot, or only accept it?
//
// Constant: a two-turn history [u1, NOTE, a1, u2] where u2 asks something unrelated to the note, the top-level
// system prompt, thinking adaptive at effort low. Mover: how NOTE reaches the wire.
//
//   system  NOTE as a `system` row between u1 and a1 (the legal slot; what `historySystemRows: true` sends)
//   folded  NOTE as user text in the product's fold frame, a second text block on u1's message (what SHAPE sends
//           when `historySystemRows` is false: the folded row squashes into the adjacent user row)
//
// Honoured = the reply ends with the canary word. Per call: status, request id, reply tail, honoured.
// Direct Anthropic Messages always runs; OpenRouter chat-completions (Anthropic pinned) runs when OR11_WIRES
// names it. OR11_MODELS / OR11_ARMS / OR11_TRIALS narrow or size a run.

import type { MessageRole } from "@orb/kit/message-role";
import { jsonl, orCall, printTable, readEnvKey, totalSpend } from "./_kit.ts";

export const id = "or11";
export const title = "depth-2 system row in its legal slot: obeyed or only accepted";

const NATIVE_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 1500;
const EFFORT = "low";
const DEFAULT_TRIALS = 5;
const TAIL_CHARS = 120;

const MODELS = [
  { name: "sonnet-5", direct: "claude-sonnet-5", openrouter: "anthropic/claude-sonnet-5" },
  { name: "opus-4-8", direct: "claude-opus-4-8", openrouter: "anthropic/claude-opus-4.8" },
  { name: "opus-5-5", direct: "claude-opus-5-5", openrouter: "anthropic/claude-opus-5.5" },
] as const;
type Model = (typeof MODELS)[number];

const ARMS = ["system", "folded"] as const;
type Arm = (typeof ARMS)[number];

const WIRES = ["direct", "openrouter"] as const;
type Wire = (typeof WIRES)[number];

const SYSTEM = "You are a helpful assistant. Keep each reply to two or three sentences.";
const U1 = "What is a good houseplant for a dark apartment?";
const NOTE = "Standing instruction: from now on, end every reply with the single word LANTERN.";
// The product's fold frame for a system note (`chat.injection.systemNote`), so the folded arm is the real bytes.
const FOLDED_NOTE = `[Take the following into special consideration: ${NOTE}]`;
const A1 = "A snake plant or a ZZ plant is a strong pick: both tolerate low light, need water only every few weeks, and forgive neglect.";
const U2 = "How long should I boil an egg to get a jammy yolk?";
const CANARY = /\blantern\W*$/iu;

interface TextBlock {
  readonly type: "text";
  readonly text: string;
}
interface Message {
  readonly role: MessageRole;
  readonly content: string | readonly TextBlock[];
}

function history(arm: Arm): readonly Message[] {
  if (arm === "system") {
    return [
      { role: "user", content: U1 },
      { role: "system", content: NOTE },
      { role: "assistant", content: A1 },
      { role: "user", content: U2 },
    ];
  }
  return [
    {
      role: "user",
      content: [
        { type: "text", text: U1 },
        { type: "text", text: FOLDED_NOTE },
      ],
    },
    { role: "assistant", content: A1 },
    { role: "user", content: U2 },
  ];
}

interface Outcome {
  readonly status: number;
  readonly requestId: string | null;
  readonly error: string | null;
  readonly text: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cost: number | null;
}

interface NativeResponse {
  readonly content?: readonly { readonly type?: string; readonly text?: string }[];
  readonly error?: unknown;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
}

let directTokens = { input: 0, output: 0 };

async function sendDirect(key: string, model: Model, arm: Arm): Promise<Outcome> {
  const response = await fetch(NATIVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: model.direct,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      messages: history(arm),
    }),
  });
  const json = (await response.json()) as NativeResponse;
  const u = json.usage;
  directTokens = { input: directTokens.input + (u?.input_tokens ?? 0), output: directTokens.output + (u?.output_tokens ?? 0) };
  return {
    status: response.status,
    requestId: response.headers.get("request-id"),
    error: json.error === undefined ? null : JSON.stringify(json.error).slice(0, 600),
    text: (json.content ?? []).flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join(""),
    inputTokens: u?.input_tokens ?? null,
    outputTokens: u?.output_tokens ?? null,
    cost: null,
  };
}

async function sendOpenRouter(key: string, model: Model, arm: Arm): Promise<Outcome> {
  const r = await orCall(
    {
      model: model.openrouter,
      max_tokens: MAX_TOKENS,
      reasoning: { effort: EFFORT },
      messages: [{ role: "system", content: SYSTEM }, ...history(arm).map((m) => ({ role: m.role, content: m.content }))],
    },
    key,
  );
  return {
    status: r.status,
    requestId: r.json.id ?? null,
    error: r.error,
    text: typeof r.message?.content === "string" ? r.message.content : "",
    inputTokens: r.usage.promptTokens,
    outputTokens: r.usage.completionTokens,
    cost: r.usage.cost,
  };
}

export async function run() {
  const pick = <T extends string>(env: string, all: readonly T[], fallback: readonly T[] = all): readonly T[] => {
    const wanted = (process.env[env] ?? "").split(",").filter((s) => s.length > 0);
    return wanted.length === 0 ? fallback : all.filter((v) => wanted.includes(v));
  };
  const keys: Record<Wire, string> = {
    direct: readEnvKey("ANTHROPIC_PROBE_KEY") || readEnvKey("ANTHROPIC_API_KEY"),
    openrouter: readEnvKey("OPENROUTER_PROBE_KEY") || readEnvKey("OPENROUTER_API_KEY"),
  };
  const trials = Number(process.env["OR11_TRIALS"] ?? DEFAULT_TRIALS);
  const out = jsonl(id);
  const rows: Record<string, unknown>[] = [];
  for (const wire of pick("OR11_WIRES", WIRES, ["direct"])) {
    for (const model of MODELS.filter((m) => pick("OR11_MODELS", MODELS.map((x) => x.name)).includes(m.name))) {
      for (const arm of pick("OR11_ARMS", ARMS)) {
        for (let trial = 1; trial <= trials; trial += 1) {
          const o = wire === "direct" ? await sendDirect(keys.direct, model, arm) : await sendOpenRouter(keys.openrouter, model, arm);
          const row = {
            kind: "arm",
            probe: id,
            wire,
            model: model.name,
            arm,
            trial,
            status: o.status,
            requestId: o.requestId,
            error: o.error,
            inputTokens: o.inputTokens,
            outputTokens: o.outputTokens,
            cost: o.cost,
            honoured: o.status === 200 && CANARY.test(o.text.trim()),
            replyTail: o.text.trim().slice(-TAIL_CHARS),
          };
          out.append(row);
          rows.push(row);
        }
      }
    }
  }
  const tally: Record<string, string> = {};
  for (const row of rows) {
    const cell = `${String(row["wire"])} ${String(row["model"])} ${String(row["arm"])}`;
    const [honoured = 0, total = 0] = (tally[cell] ?? "0/0").split("/").map(Number);
    tally[cell] = `${honoured + (row["honoured"] === true ? 1 : 0)}/${total + 1}`;
  }
  const verdict = { kind: "verdict", probe: id, at: new Date().toISOString(), calls: rows.length, tally, openrouterSpend: totalSpend(), directTokens };
  out.append(verdict);
  printTable(rows.map(({ wire, model, arm, trial, status, requestId, honoured, replyTail }) => ({ wire, model, arm, trial, status, requestId, honoured, replyTail })));
  return verdict;
}
