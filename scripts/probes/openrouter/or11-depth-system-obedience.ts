// OR-11 — does a model OBEY a note at depth 2 as a system row, and which fold to user text carries it as well?
//
// Constant: the top-level system prompt, u1 (a houseplant question), a fixed a1 reply, u2 (an unrelated egg
// question), thinking adaptive at effort low. Honoured = the reply ends with the canary word. Movers:
//
//   note       standing ("from now on, end every reply …") or next (a note for the next reply only, as a guided
//              steer is worded)
//   placement  system  a `system` row between u1 and a1 (the legal slot; the control)
//              a       a separate text block after u1's text
//              b / c   merged into u1's text, joined by a blank line, the note after / before the user text (b is
//                      what SHAPE sends today: the squash joins a folded injection into the stored row beside it)
//              d / e   on the LATEST user message u2: a separate block / merged into its text after the question
//   frame      the wrapper around the note on a user placement (the product frames are quoted from contracts)
//
// Direct Anthropic Messages only. OR11_MODELS / OR11_NOTES / OR11_PLACEMENTS / OR11_FRAMES / OR11_TRIALS narrow or
// size a run; OR11_CAP_USD stops it once the estimated spend reaches the cap. Calls run OR11_CONCURRENCY at a time.

import type { MessageRole } from "@orb/kit/message-role";
import { jsonl, printTable, readEnvKey } from "./_kit.ts";

export const id = "or11";
export const title = "depth-2 note: system row obeyed, and which user-text fold carries it";

const NATIVE_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 1500;
const EFFORT = "low";
const DEFAULT_TRIALS = 5;
const DEFAULT_CAP_USD = 2;
const DEFAULT_CONCURRENCY = 4;
const TAIL_CHARS = 120;
const PER_MILLION = 1_000_000;

// List prices in USD per million tokens, read from OpenRouter's /api/v1/models (they match Anthropic's list), used
// only for the running spend estimate and the cap.
const MODELS = [
  { name: "sonnet-5", direct: "claude-sonnet-5", inputPrice: 2, outputPrice: 10 },
  { name: "opus-4-8", direct: "claude-opus-4-8", inputPrice: 5, outputPrice: 25 },
  { name: "opus-5-5", direct: "claude-opus-5-5", inputPrice: 4, outputPrice: 20 },
] as const;
type Model = (typeof MODELS)[number];

const NOTES = {
  standing: "Standing instruction: from now on, end every reply with the single word LANTERN.",
  next: "End your next reply with the single word LANTERN.",
} as const;
type NoteKind = keyof typeof NOTES;
const NOTE_KINDS = Object.keys(NOTES) as NoteKind[];

const PLACEMENTS = ["system", "a", "b", "c", "d", "e"] as const;
type Placement = (typeof PLACEMENTS)[number];

// `consideration` is `chat.injection.systemNote` and `guided` is `chat.injection.assistantNote` /
// `preset.guided.response` (packages/contracts/src/chat/prose.ts, packages/contracts/src/preset/prose.ts); `ooc`
// takes the `[OOC: …]` prefix of the preset's guided rewrite and continue slots. The rest are candidates.
const FRAMES = {
  consideration: (note: string) => `[Take the following into special consideration: ${note}]`,
  guided: (note: string) => `[Take the following into special consideration for your next message: ${note}]`,
  ooc: (note: string) => `[OOC: ${note}]`,
  systemNote: (note: string) => `[System note: ${note}]`,
  xml: (note: string) => `<system_note>${note}</system_note>`,
  bare: (note: string) => note,
} as const satisfies Record<string, (note: string) => string>;
type Frame = keyof typeof FRAMES;
const FRAME_KINDS = Object.keys(FRAMES) as Frame[];

const SYSTEM = "You are a helpful assistant. Keep each reply to two or three sentences.";
const U1 = "What is a good houseplant for a dark apartment?";
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
interface Cell {
  readonly model: Model;
  readonly note: NoteKind;
  readonly placement: Placement;
  /** Null on the `system` placement: the row carries the bare note. */
  readonly frame: Frame | null;
}

const text = (t: string): TextBlock => ({ type: "text", text: t });

function history(cell: Cell): readonly Message[] {
  const note = NOTES[cell.note];
  const framed = cell.frame === null ? note : FRAMES[cell.frame](note);
  const a1: Message = { role: "assistant", content: A1 };
  switch (cell.placement) {
    case "system":
      return [{ role: "user", content: U1 }, { role: "system", content: note }, a1, { role: "user", content: U2 }];
    case "a":
      return [{ role: "user", content: [text(U1), text(framed)] }, a1, { role: "user", content: U2 }];
    case "b":
      return [{ role: "user", content: `${U1}\n\n${framed}` }, a1, { role: "user", content: U2 }];
    case "c":
      return [{ role: "user", content: `${framed}\n\n${U1}` }, a1, { role: "user", content: U2 }];
    case "d":
      return [{ role: "user", content: U1 }, a1, { role: "user", content: [text(U2), text(framed)] }];
    case "e":
      return [{ role: "user", content: U1 }, a1, { role: "user", content: `${U2}\n\n${framed}` }];
  }
}

interface NativeResponse {
  readonly content?: readonly { readonly type?: string; readonly text?: string }[];
  readonly error?: unknown;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
}

interface Outcome {
  readonly status: number;
  readonly requestId: string | null;
  readonly error: string | null;
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

async function send(key: string, cell: Cell): Promise<Outcome> {
  const response = await fetch(NATIVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: cell.model.direct,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      messages: history(cell),
    }),
  });
  const json = (await response.json()) as NativeResponse;
  return {
    status: response.status,
    requestId: response.headers.get("request-id"),
    error: json.error === undefined ? null : JSON.stringify(json.error).slice(0, 600),
    text: (json.content ?? []).flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join(""),
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}

const cellId = (c: Cell): string => `${c.model.name} ${c.note} ${c.placement}${c.frame === null ? "" : `/${c.frame}`}`;

export async function run() {
  const pick = <T extends string>(env: string, all: readonly T[]): readonly T[] => {
    const wanted = (process.env[env] ?? "").split(",").filter((s) => s.length > 0);
    return wanted.length === 0 ? all : all.filter((v) => wanted.includes(v));
  };
  const key = readEnvKey("ANTHROPIC_PROBE_KEY") || readEnvKey("ANTHROPIC_API_KEY");
  const trials = Number(process.env["OR11_TRIALS"] ?? DEFAULT_TRIALS);
  const cap = Number(process.env["OR11_CAP_USD"] ?? DEFAULT_CAP_USD);
  const concurrency = Number(process.env["OR11_CONCURRENCY"] ?? DEFAULT_CONCURRENCY);
  const models = MODELS.filter((m) => pick("OR11_MODELS", MODELS.map((x) => x.name)).includes(m.name));
  const frames = pick("OR11_FRAMES", FRAME_KINDS);

  const queue: { readonly cell: Cell; readonly trial: number }[] = [];
  for (const note of pick("OR11_NOTES", NOTE_KINDS)) {
    for (const placement of pick("OR11_PLACEMENTS", PLACEMENTS)) {
      for (const frame of placement === "system" ? [null] : frames) {
        for (const model of models) {
          for (let trial = 1; trial <= trials; trial += 1) {
            queue.push({ cell: { model, note, placement, frame }, trial });
          }
        }
      }
    }
  }

  const out = jsonl(id);
  const rows: Record<string, unknown>[] = [];
  let spend = 0;
  let stopped = false;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < queue.length && !stopped) {
      if (spend >= cap) {
        stopped = true;
        return;
      }
      const job = queue[next];
      next += 1;
      if (job === undefined) {
        return;
      }
      const { cell, trial } = job;
      const o = await send(key, cell);
      const cost = (o.inputTokens * cell.model.inputPrice + o.outputTokens * cell.model.outputPrice) / PER_MILLION;
      spend += cost;
      const honoured = o.status === 200 && CANARY.test(o.text.trim());
      const row = {
        kind: "arm",
        probe: id,
        leg: 2,
        wire: "direct",
        model: cell.model.name,
        note: cell.note,
        placement: cell.placement,
        frame: cell.frame,
        trial,
        status: o.status,
        requestId: o.requestId,
        error: o.error,
        inputTokens: o.inputTokens,
        outputTokens: o.outputTokens,
        estimatedCost: cost,
        honoured,
        replyTail: o.text.trim().slice(-TAIL_CHARS),
      };
      out.append(row);
      rows.push(row);
      console.log(`${String(rows.length).padStart(4)}/${queue.length} ${cellId(cell)} #${trial} ${o.status} ${honoured ? "HONOURED" : "-"} spend $${spend.toFixed(4)}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const tally: Record<string, string> = {};
  for (const row of rows) {
    const cell = `${String(row["model"])} ${String(row["note"])} ${String(row["placement"])}${row["frame"] === null ? "" : `/${String(row["frame"])}`}`;
    const [honoured = 0, total = 0] = (tally[cell] ?? "0/0").split("/").map(Number);
    tally[cell] = `${honoured + (row["honoured"] === true ? 1 : 0)}/${total + 1}`;
  }
  const verdict = { kind: "verdict", probe: id, leg: 2, at: new Date().toISOString(), calls: rows.length, planned: queue.length, stoppedAtCap: stopped, estimatedSpend: spend, tally };
  out.append(verdict);
  printTable(Object.entries(tally).map(([cell, honoured]) => ({ cell, honoured })));
  return verdict;
}
