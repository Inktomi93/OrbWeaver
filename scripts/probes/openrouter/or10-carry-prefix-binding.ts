// OR-10 — the reasoning carry under prefix binding: which ways of placing per-turn rows (speaker cues, depth
// notes, system-region content) keep every carried thinking block valid on the models that check it?
//
// On claude-opus-5-5 and claude-fable-5-1 a signed thinking block stays valid only while everything sent before it
// is unchanged. Each scenario is a multi-call session that carries every prior assistant turn back exactly as
// returned, thinking included, and moves ONE way of placing a per-turn row:
//
//   S1  group round, speaker cue as an ordinary user row that is gone on the next call (what the product does)
//   S2  one speaker per user message, cue as a turn-scoped system message (clear_at next_user_message) left in place
//   S2b several speakers with no user message between them: the next cue is a turn-scoped system message right
//       after the previous speaker's reply
//   S2c several speakers, cue as an ordinary user row that is KEPT in the history (append-only)
//   S3  author's note at depth 4 as an ordinary user row that moves every turn (what the product does)
//   S4  the same note at depth 0 as a turn-scoped system message appended every turn and left in place
//   S6  a lore line in the top-level system prompt that changes on call 3 (a per-turn system-region edit)
//
// Every session runs twice per model, with block_binding.prefix_mismatch_behavior "error" and "drop_block" (the
// account predates default enforcement, so setting the field opts every call in). S3 under drop_block is the
// brief's S5. An "error" session stops at its first refusal. Per call: status, error text, input_transformations,
// cache write/read (top-level automatic caching, 5m), stop reason, whether the reply thought, and the reply head.
// A second wire, OpenRouter's Anthropic-compatible /api/v1/messages, runs S1 and S2 on opus to show whether the
// beta headers, block_binding and clear_at pass through.

import type { MessageRole } from "@orb/kit/message-role";
import { ANTHROPIC_PIN, addSpend, jsonl, printTable, readEnvKey, totalSpend } from "./_kit.ts";

export const id = "or10";
export const title = "reasoning carry under prefix binding: cues, depth notes and system edits";

const NATIVE_URL = "https://api.anthropic.com/v1/messages";
const OR_MESSAGES_URL = "https://openrouter.ai/api/v1/messages";
const BETAS = ["thinking-binding-controls-2026-08-01", "mid-conversation-system-clear-at-2026-08-21"].join(",");
const MAX_TOKENS = 3000;
const EFFORT = "high";
const TURN_SCOPED = "next_user_message";
// About 45 tokens per entry: puts the prefix over the 512-token cache minimum of both models with headroom.
const LOG_ENTRIES = 18;

const MODELS = [
  { name: "opus-5-5", direct: "claude-opus-5-5", openrouter: "anthropic/claude-opus-5.5" },
  { name: "fable-5-1", direct: "claude-fable-5-1", openrouter: "anthropic/claude-fable-5.1" },
] as const;
type Model = (typeof MODELS)[number];

const MODES = ["error", "drop_block"] as const;
type Mode = (typeof MODES)[number];

// Neutral wording: claude-opus-5-5's classifier refused a "group role-play" system prompt in OR-9.
const SYSTEM = "Three friends, Mara, Wren and Kai, solve puzzles about a garden log together. Reply in one or two sentences, starting with the named friend's name and a colon.";
const SOLO_SYSTEM = "You help solve puzzles about a garden log. Reply in one or two sentences.";
const LORE = (colour: string): string => `Lore: the greenhouse door is painted ${colour}.`;
const NOTE = "Author's note: end your reply with the word lantern.";
const NOTE_CANARY = /lantern/iu;
const QUESTIONS = [
  "Puzzle 1: of the harvest counts 17, 23, 31, 44 and 53, which is the odd one out, and why?",
  "Puzzle 2: what is the total number of handfuls picked on days 1 to 5?",
  "Puzzle 3: on which day were carrots first picked?",
  "Puzzle 4: how many days mention the greenhouse?",
] as const;
const CUES = ["[Mara answers next.]", "[Wren answers next.]", "[Kai answers next.]", "[Mara answers next.]"] as const;
const NOTE_DEPTH = 4;

const CROPS = ["beans", "squash", "kale", "peas", "carrots", "leeks", "basil", "onions"];
const BEDS = ["the north bed", "the south bed", "the raised bed", "the herb spiral", "the greenhouse", "the pot row", "the orchard edge", "the trellis"];

function gardenLog(nonce: string): string {
  const out = [`Garden log ${nonce}.`];
  for (let i = 0; i < LOG_ENTRIES; i += 1) {
    out.push(`Day ${i + 1}: watered ${BEDS[(i * 3) % BEDS.length]} at dawn, picked ${((i * 7) % 13) + 2} handfuls of ${CROPS[i % CROPS.length]}, and turned the compost near ${BEDS[(i * 5 + 1) % BEDS.length]}.`);
  }
  return out.join("\n");
}

// ---- messages ----

type Block = Readonly<Record<string, unknown>>;
interface Message {
  readonly role: MessageRole;
  readonly content: string | readonly Block[];
  readonly clear_at?: string;
}
const user = (text: string): Message => ({ role: "user", content: text });
const turnScoped = (text: string): Message => ({ role: "system", content: text, clear_at: TURN_SCOPED });
/** An assistant turn exactly as the API returned it: every block, in order, thinking included. */
const carried = (blocks: readonly Block[]): Message => ({ role: "assistant", content: blocks });

// ---- scenarios ----

/** One call of a session: the top-level system prompt and the messages, built from the replies so far. */
interface Call {
  readonly system: string;
  readonly messages: readonly Message[];
}
interface Scenario {
  readonly name: string;
  readonly calls: number;
  readonly note: boolean;
  readonly build: (k: number, p: string, replies: readonly (readonly Block[])[]) => Call;
}

const reply = (replies: readonly (readonly Block[])[], i: number): Message => carried(replies[i] ?? []);

// A solo history before call k: [P+Q1, a1, Q2, a2, …, Qk].
function soloHistory(k: number, p: string, replies: readonly (readonly Block[])[]): Message[] {
  const out: Message[] = [user(`${p}\n\n${QUESTIONS[0]}`)];
  for (let i = 1; i <= k; i += 1) {
    out.push(reply(replies, i - 1), user(QUESTIONS[i] ?? ""));
  }
  return out;
}

// A depth-N note as an ordinary user row: N messages up from the end, clamped to the top.
function withDepthNote(history: readonly Message[], depth: number): Message[] {
  const at = Math.max(1, history.length - depth);
  return [...history.slice(0, at), user(NOTE), ...history.slice(at)];
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: "S1-cue-user-row-deleted",
    calls: 4,
    note: false,
    build: (k, p, r) => {
      const opening = user(`${p}\n\n${QUESTIONS[0]}`);
      const turns: readonly Message[][] = [
        [opening, user(CUES[0])],
        [opening, reply(r, 0), user(CUES[1])],
        [opening, reply(r, 0), reply(r, 1), user(QUESTIONS[1]), user(CUES[2])],
        [opening, reply(r, 0), reply(r, 1), user(QUESTIONS[1]), reply(r, 2), user(CUES[3])],
      ];
      return { system: SYSTEM, messages: turns[k] ?? [] };
    },
  },
  {
    name: "S2-cue-turn-scoped-one-speaker-per-user-message",
    calls: 4,
    note: false,
    build: (k, p, r) => {
      const messages: Message[] = [user(`${p}\n\n${QUESTIONS[0]}`), turnScoped(CUES[0])];
      for (let i = 1; i <= k; i += 1) {
        messages.push(reply(r, i - 1), user(QUESTIONS[i] ?? ""), turnScoped(CUES[i] ?? ""));
      }
      return { system: SYSTEM, messages };
    },
  },
  {
    name: "S2b-cue-turn-scoped-after-a-reply",
    calls: 3,
    note: false,
    build: (k, p, r) => {
      const round = [user(`${p}\n\n${QUESTIONS[0]}`), turnScoped(CUES[0]), reply(r, 0), turnScoped(CUES[1])];
      const turns: readonly Message[][] = [round.slice(0, 2), round, [...round, reply(r, 1), user(QUESTIONS[1]), turnScoped(CUES[2])]];
      return { system: SYSTEM, messages: turns[k] ?? [] };
    },
  },
  {
    name: "S2c-cue-user-row-kept",
    calls: 4,
    note: false,
    build: (k, p, r) => {
      const all: Message[] = [
        user(`${p}\n\n${QUESTIONS[0]}`),
        user(CUES[0]),
        reply(r, 0),
        user(CUES[1]),
        reply(r, 1),
        user(QUESTIONS[1]),
        user(CUES[2]),
        reply(r, 2),
        user(CUES[3]),
      ];
      const ends = [2, 4, 7, 9];
      return { system: SYSTEM, messages: all.slice(0, ends[k]) };
    },
  },
  {
    name: "S3-note-depth4-user-row-moving",
    calls: 4,
    note: true,
    // The note starts on call 2, as an author's note switched on mid-chat does.
    build: (k, p, r) => ({ system: SOLO_SYSTEM, messages: k === 0 ? soloHistory(0, p, r) : withDepthNote(soloHistory(k, p, r), NOTE_DEPTH) }),
  },
  {
    name: "S4-note-depth0-turn-scoped-appended",
    calls: 4,
    note: true,
    build: (k, p, r) => {
      const messages: Message[] = [user(`${p}\n\n${QUESTIONS[0]}`)];
      for (let i = 1; i <= k; i += 1) {
        if (i >= 2) {
          messages.push(turnScoped(NOTE));
        }
        messages.push(reply(r, i - 1), user(QUESTIONS[i] ?? ""));
      }
      if (k >= 1) {
        messages.push(turnScoped(NOTE));
      }
      return { system: SOLO_SYSTEM, messages };
    },
  },
  {
    name: "S6-system-lore-changes-on-call-3",
    calls: 4,
    note: false,
    build: (k, p, r) => ({ system: `${SOLO_SYSTEM}\n\n${LORE(k >= 2 ? "green" : "blue")}`, messages: soloHistory(k, p, r) }),
  },
];

// ---- the wire ----

type Wire = "direct" | "openrouter-messages";

interface Outcome {
  readonly status: number;
  readonly error: string | null;
  readonly blocks: readonly Block[];
  readonly stopReason: string | null;
  readonly cacheWrite: number | null;
  readonly cacheRead: number | null;
  readonly inputTokens: number | null;
  readonly cost: number | null;
  readonly transformations: unknown;
}

interface Response {
  readonly content?: readonly Block[];
  readonly stop_reason?: string;
  readonly error?: unknown;
  readonly input_transformations?: unknown;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_creation_input_tokens?: number;
    readonly cache_read_input_tokens?: number;
    readonly cost?: number;
  };
}

let directTokens = { input: 0, write: 0, read: 0, output: 0 };

async function send(wire: Wire, key: string, model: Model, mode: Mode, call: Call): Promise<Outcome> {
  const viaOpenRouter = wire === "openrouter-messages";
  const response = await fetch(viaOpenRouter ? OR_MESSAGES_URL : NATIVE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(viaOpenRouter ? { Authorization: `Bearer ${key}` } : { "x-api-key": key }),
      "anthropic-version": "2023-06-01",
      "anthropic-beta": BETAS,
    },
    body: JSON.stringify({
      model: viaOpenRouter ? model.openrouter : model.direct,
      ...(viaOpenRouter ? { provider: ANTHROPIC_PIN } : {}),
      max_tokens: MAX_TOKENS,
      cache_control: { type: "ephemeral" },
      system: call.system,
      thinking: { type: "adaptive", display: "summarized", block_binding: { prefix_mismatch_behavior: mode } },
      output_config: { effort: EFFORT },
      messages: call.messages,
    }),
  });
  const json = (await response.json()) as Response;
  const u = json.usage;
  if (viaOpenRouter) {
    addSpend(u?.cost ?? 0);
  } else {
    directTokens = {
      input: directTokens.input + (u?.input_tokens ?? 0),
      write: directTokens.write + (u?.cache_creation_input_tokens ?? 0),
      read: directTokens.read + (u?.cache_read_input_tokens ?? 0),
      output: directTokens.output + (u?.output_tokens ?? 0),
    };
  }
  return {
    status: response.status,
    error: json.error === undefined ? null : JSON.stringify(json.error).slice(0, 900),
    blocks: json.content ?? [],
    stopReason: json.stop_reason ?? null,
    cacheWrite: u?.cache_creation_input_tokens ?? null,
    cacheRead: u?.cache_read_input_tokens ?? null,
    inputTokens: u?.input_tokens ?? null,
    cost: u?.cost ?? null,
    transformations: json.input_transformations ?? null,
  };
}

const textOf = (blocks: readonly Block[]): string => blocks.flatMap((b) => (b["type"] === "text" && typeof b["text"] === "string" ? [b["text"]] : [])).join("");
const thinkingCount = (blocks: readonly Block[]): number => blocks.filter((b) => b["type"] === "thinking" || b["type"] === "redacted_thinking").length;
/** How many carried thinking blocks a call sent: the model's reasoning at risk on that call. */
const sentThinking = (messages: readonly Message[]): number => messages.reduce((n, m) => n + (typeof m.content === "string" ? 0 : thinkingCount(m.content)), 0);

export async function run() {
  const keys: Record<Wire, string> = {
    direct: readEnvKey("ANTHROPIC_PROBE_KEY") || readEnvKey("ANTHROPIC_API_KEY"),
    "openrouter-messages": readEnvKey("OPENROUTER_PROBE_KEY") || readEnvKey("OPENROUTER_API_KEY"),
  };
  // OR10_WIRES / OR10_MODELS / OR10_SCENARIOS / OR10_MODES narrow a re-run (comma lists); unset runs the plan.
  const pick = <T extends string>(env: string, all: readonly T[]): readonly T[] => {
    const wanted = (process.env[env] ?? "").split(",").filter((s) => s.length > 0);
    return wanted.length === 0 ? all : all.filter((v) => wanted.includes(v));
  };
  const out = jsonl(id);
  const rows: Record<string, unknown>[] = [];
  // The OpenRouter pass-through check needs only the cue scenarios on one model.
  const plan: readonly { readonly wire: Wire; readonly models: readonly Model[]; readonly scenarios: readonly Scenario[] }[] = [
    { wire: "direct", models: MODELS, scenarios: SCENARIOS },
    { wire: "openrouter-messages", models: MODELS.filter((m) => m.name === "opus-5-5"), scenarios: SCENARIOS.filter((s) => s.name.startsWith("S1") || s.name.startsWith("S2-")) },
  ];
  for (const leg of plan.filter((l) => pick("OR10_WIRES", ["direct", "openrouter-messages"] as const).includes(l.wire))) {
    for (const model of leg.models.filter((m) => pick("OR10_MODELS", MODELS.map((x) => x.name)).includes(m.name))) {
      for (const scenario of leg.scenarios.filter((s) => pick("OR10_SCENARIOS", SCENARIOS.map((x) => x.name)).includes(s.name))) {
        for (const mode of pick("OR10_MODES", MODES)) {
          const nonce = `or10-${leg.wire}-${model.name}-s${SCENARIOS.indexOf(scenario)}-${mode === "error" ? "e" : "d"}-${Date.now()}`;
          const p = gardenLog(nonce);
          const replies: (readonly Block[])[] = [];
          for (let k = 0; k < scenario.calls; k += 1) {
            const call = scenario.build(k, p, replies);
            const o = await send(leg.wire, keys[leg.wire], model, mode, call);
            const text = textOf(o.blocks);
            const row = {
              kind: "arm",
              probe: id,
              wire: leg.wire,
              model: model.name,
              scenario: scenario.name,
              mode,
              call: k + 1,
              status: o.status,
              error: o.error,
              stopReason: o.stopReason,
              sentThinking: sentThinking(call.messages),
              transformations: o.transformations,
              cacheWrite: o.cacheWrite,
              cacheRead: o.cacheRead,
              inputTokens: o.inputTokens,
              cost: o.cost,
              replyThinking: thinkingCount(o.blocks),
              replyHead: text.slice(0, 160),
              noteFollowed: scenario.note ? NOTE_CANARY.test(text) : null,
            };
            out.append(row);
            rows.push(row);
            if (o.status !== 200) {
              break;
            }
            replies.push(o.blocks);
          }
        }
      }
    }
  }
  const verdict = { kind: "verdict", probe: id, at: new Date().toISOString(), calls: rows.length, openrouterSpend: totalSpend(), directTokens };
  out.append(verdict);
  printTable(
    rows.map(({ wire, model, scenario, mode, call, status, stopReason, sentThinking: sent, cacheRead, replyThinking, noteFollowed }) => ({
      wire,
      model,
      scenario,
      mode,
      call,
      status,
      stopReason,
      sent,
      cacheRead,
      replyThinking,
      noteFollowed,
    })),
  );
  return verdict;
}
