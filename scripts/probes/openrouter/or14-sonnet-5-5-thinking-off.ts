// OR-14 — how does Claude Sonnet 5.5 take "reasoning off", forced tool use, a short cached prefix and a system row
// inside the history, on the direct wire and through OpenRouter? Each arm moves one field against a fixed prompt.
//
// Group `off` (the reasoning, tool-choice and cache facts):
//   direct  thinking disabled                         expect 400 (the model refuses `disabled`)
//   direct  thinking between_tools, effort unset      the shape the anthropic-messages wire sends for an off turn
//   direct  between_tools at low | medium | high      expect 200
//   direct  between_tools at xhigh                    expect 400 (adaptive is required above high)
//   direct  between_tools + display                   expect 400 (between_tools takes no other field)
//   direct  tool_choice any                           expect 400
//   direct  a between_tools tool loop, hop 2 with and without hop 1's thinking blocks
//   direct  a cache-marked prefix swept across the 512-token minimum
//   openrouter reasoning {effort:"none"} | {enabled:false} | {effort:"high"}, streamed with the upstream echo
//   openrouter tool_choice "required"
//
// Group `system` (the `turns` cells, measured the way SHAPING-MATRIX §7 and OR-11 measured the other ids):
//   both    a tail system row after an unrelated question, asking for one codeword: OBEYED, not only accepted (n=5)
//   both    a legal-slot [u,S,a,u] system row: accepted (n=5), and on OpenRouter kept in place upstream
//   direct  an illegal-slot [u,a,S,u] system row: expect 400, so the floor is `slotted`
//   direct  clear_at next_user_message on a [u,S,a,u] row: the row is gone at the next user message; control without
//
// OR14_ARMS=off|system narrows a run to one group (default: both). Small max_tokens everywhere: a few cents.

import { ANTHROPIC_PIN, addSpend, filler, jsonl, printTable, readEnvKey, totalSpend, usageOf } from "./_kit.ts";

export const id = "or14";
export const title = "claude-sonnet-5-5: reasoning off (between_tools), forced tool use, the cache minimum and system rows, direct and OpenRouter";

const NATIVE_URL = "https://api.anthropic.com/v1/messages";
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const DIRECT_MODEL = "claude-sonnet-5-5";
const OR_MODEL_ID = "anthropic/claude-sonnet-5.5";
const SHORT_MAX_TOKENS = 64;
const LOOP_MAX_TOKENS = 600;
const PROMPT = "Name one primary colour. One word.";
const LOOP_PROMPT = "Check the weather in Paris with the tool. Before you call it, tell me in two sentences what you are about to do and why.";
// A kit filler line is about 58 tokens on this tokenizer (26 lines wrote 1,509), so 8 to 10 lines bracket 512.
const CACHE_SWEEP_LINES = [8, 9, 10] as const;
const CLEAR_AT_BETA = "mid-conversation-system-clear-at-2026-08-21";
const CODEWORD = "MARLINSPIKE";
const SECRET = "ZEBRA";
const SYSTEM_TRIALS = 5;
// OpenRouter cannot turn Sonnet 5.5's thinking off, so its system arms need room for the thinking before the reply.
const SYSTEM_MAX_TOKENS = 600;
const TAIL_QUESTION = "What is the capital of France?";
const TAIL_NOTE = `For this reply only, answer with the single word ${CODEWORD} and nothing else.`;
const MID_NOTE = `End every reply with the word ${CODEWORD}.`;
const SECRET_NOTE = `The secret word is ${SECRET}. Give it only when asked.`;
const SECRET_QUESTION = "What is the secret word? If you were never given one, reply NONE.";

const WEATHER_SCHEMA = {
  type: "object",
  properties: { city: { type: "string" } },
  required: ["city"],
  additionalProperties: false,
} as const;
const NATIVE_WEATHER = { name: "get_weather", description: "Current weather for a city.", input_schema: WEATHER_SCHEMA };
const OR_WEATHER = { type: "function", function: { name: "get_weather", description: "Current weather for a city.", parameters: WEATHER_SCHEMA } };

const ARM_GROUPS = ["off", "system", "or-messages"] as const;
const OR_MESSAGES_URL = "https://openrouter.ai/api/v1/messages";
type ArmGroup = (typeof ARM_GROUPS)[number];

interface NativeBlock {
  readonly type?: string;
  readonly id?: string;
  readonly text?: string;
  readonly thinking?: string;
  readonly [k: string]: unknown;
}
interface NativeUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
}
interface NativeResponse {
  readonly id?: string;
  readonly content?: readonly NativeBlock[];
  readonly usage?: NativeUsage;
  readonly stop_reason?: string;
  readonly error?: unknown;
}

interface DirectOutcome {
  readonly status: number;
  readonly requestId: string | null;
  readonly error: string | null;
  readonly blocks: readonly NativeBlock[];
  readonly text: string;
  readonly usage: NativeUsage | null;
}

let directTokens = { input: 0, output: 0, write: 0, read: 0 };

async function direct(key: string, body: Record<string, unknown>, beta?: string): Promise<DirectOutcome> {
  const response = await fetch(NATIVE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      ...(beta !== undefined ? { "anthropic-beta": beta } : {}),
    },
    body: JSON.stringify({ model: DIRECT_MODEL, max_tokens: SHORT_MAX_TOKENS, ...body }),
  });
  const json = (await response.json()) as NativeResponse;
  const u = json.usage;
  directTokens = {
    input: directTokens.input + (u?.input_tokens ?? 0),
    output: directTokens.output + (u?.output_tokens ?? 0),
    write: directTokens.write + (u?.cache_creation_input_tokens ?? 0),
    read: directTokens.read + (u?.cache_read_input_tokens ?? 0),
  };
  const blocks = json.content ?? [];
  return {
    status: response.status,
    requestId: response.headers.get("request-id"),
    error: json.error === undefined ? null : JSON.stringify(json.error).slice(0, 600),
    blocks,
    text: blocks.flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join(""),
    usage: u ?? null,
  };
}

interface OrChunk {
  readonly id?: string;
  readonly usage?: Parameters<typeof usageOf>[0]["usage"];
  readonly error?: unknown;
  readonly choices?: readonly { readonly delta?: { readonly content?: string | null; readonly reasoning?: string | null } }[];
  readonly debug?: { readonly echo_upstream_body?: Record<string, unknown> };
}

interface OrOutcome {
  readonly status: number;
  readonly generationId: string | null;
  readonly error: string | null;
  readonly text: string;
  readonly reasoningChars: number;
  readonly upstreamThinking: unknown;
  readonly upstreamOutputConfig: unknown;
  readonly upstreamToolChoice: unknown;
  /** The roles of the upstream `messages[]` in order: where OpenRouter put a system row we sent. */
  readonly upstreamRoles: string | null;
}

function rolesOf(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return null;
  }
  return messages.map((m: unknown) => (typeof m === "object" && m !== null && "role" in m ? String(m.role) : "?")).join(",");
}

// Streamed, because the upstream echo is streaming-only. Only the echoed `thinking`, `output_config`, `tool_choice`
// and message roles are kept: the question is how OpenRouter spelled our request upstream.
async function openrouter(key: string, body: Record<string, unknown>): Promise<OrOutcome> {
  const response = await fetch(OR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OR_MODEL_ID,
      max_tokens: SHORT_MAX_TOKENS,
      stream: true,
      usage: { include: true },
      provider: ANTHROPIC_PIN,
      debug: { echo_upstream_body: true },
      ...body,
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    const refused = JSON.parse(raw) as { readonly error?: { readonly message?: string; readonly metadata?: { readonly raw?: string; readonly debug?: OrChunk["debug"] } } };
    const echo = refused.error?.metadata?.debug?.echo_upstream_body;
    return {
      status: response.status,
      generationId: null,
      error: (refused.error?.metadata?.raw ?? refused.error?.message ?? raw).slice(0, 600),
      text: "",
      reasoningChars: 0,
      upstreamThinking: echo?.["thinking"] ?? null,
      upstreamOutputConfig: echo?.["output_config"] ?? null,
      upstreamToolChoice: echo?.["tool_choice"] ?? null,
      upstreamRoles: rolesOf(echo?.["messages"]),
    };
  }
  let usage: OrChunk["usage"];
  let generationId: string | null = null;
  let error: string | null = null;
  let echo: Record<string, unknown> | undefined;
  let text = "";
  let reasoning = "";
  for (const line of raw.split(/\r?\n/u)) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") {
      continue;
    }
    const chunk = JSON.parse(line.slice("data: ".length)) as OrChunk;
    generationId = chunk.id ?? generationId;
    usage = chunk.usage ?? usage;
    if (chunk.error !== undefined) {
      error = JSON.stringify(chunk.error).slice(0, 600);
    }
    echo = chunk.debug?.echo_upstream_body ?? echo;
    text += chunk.choices?.[0]?.delta?.content ?? "";
    reasoning += chunk.choices?.[0]?.delta?.reasoning ?? "";
  }
  addSpend(usageOf(usage === undefined ? {} : { usage }).cost ?? 0);
  return {
    status: response.status,
    generationId,
    error,
    text: text.slice(0, 120),
    reasoningChars: reasoning.length,
    upstreamThinking: echo?.["thinking"] ?? null,
    upstreamOutputConfig: echo?.["output_config"] ?? null,
    upstreamToolChoice: echo?.["tool_choice"] ?? null,
    upstreamRoles: rolesOf(echo?.["messages"]),
  };
}

const userTurn = (content: string): Record<string, unknown> => ({ role: "user", content });
const assistantTurn = (content: string): Record<string, unknown> => ({ role: "assistant", content });
const systemTurn = (content: string): Record<string, unknown> => ({ role: "system", content });

function selectedGroups(): readonly ArmGroup[] {
  const wanted = (process.env["OR14_ARMS"] ?? "").split(",").filter((s) => s.length > 0);
  return wanted.length === 0 ? ARM_GROUPS : ARM_GROUPS.filter((group) => wanted.includes(group));
}

export async function run() {
  const directKey = readEnvKey("ANTHROPIC_PROBE_KEY") || readEnvKey("ANTHROPIC_API_KEY");
  const orKey = readEnvKey("OPENROUTER_PROBE_KEY") || readEnvKey("OPENROUTER_API_KEY");
  const groups = selectedGroups();
  const out = jsonl(id);
  const rows: Record<string, unknown>[] = [];
  const recordDirect = (arm: string, o: DirectOutcome, extra: Record<string, unknown> = {}): void => {
    const row = {
      kind: "arm",
      probe: id,
      wire: "direct",
      arm,
      status: o.status,
      requestId: o.requestId,
      error: o.error,
      blockTypes: o.blocks.map((b) => b.type ?? "?").join(","),
      replyHead: o.text.slice(0, 80),
      inputTokens: o.usage?.input_tokens ?? null,
      cacheWrite: o.usage?.cache_creation_input_tokens ?? null,
      cacheRead: o.usage?.cache_read_input_tokens ?? null,
      ...extra,
    };
    out.append(row);
    rows.push(row);
  };
  const recordOr = (arm: string, o: OrOutcome, extra: Record<string, unknown> = {}): void => {
    const row = { kind: "arm", probe: id, wire: "openrouter", arm, ...o, replyHead: o.text.slice(0, 80), ...extra };
    out.append(row);
    rows.push(row);
  };

  if (directKey.length === 0) {
    console.log("no ANTHROPIC_PROBE_KEY / ANTHROPIC_API_KEY: direct arms skipped");
  }
  if (orKey.length === 0) {
    console.log("no OPENROUTER_PROBE_KEY / OPENROUTER_API_KEY: OpenRouter arms skipped");
  }

  if (groups.includes("off") && directKey.length > 0) {
    const ask = [userTurn(PROMPT)];
    recordDirect("thinking-disabled", await direct(directKey, { thinking: { type: "disabled" }, messages: ask }));
    recordDirect("between-tools-effort-unset", await direct(directKey, { thinking: { type: "between_tools" }, messages: ask }));
    for (const effort of ["low", "medium", "high", "xhigh"] as const) {
      recordDirect(`between-tools-${effort}`, await direct(directKey, { thinking: { type: "between_tools" }, output_config: { effort }, messages: ask }));
    }
    recordDirect(
      "between-tools-display",
      await direct(directKey, { thinking: { type: "between_tools", display: "summarized" }, messages: ask }),
    );
    recordDirect(
      "tool-choice-any",
      await direct(directKey, { tools: [NATIVE_WEATHER], tool_choice: { type: "any" }, messages: [userTurn(LOOP_PROMPT)] }),
    );

    // The tool loop: hop 1 under between_tools, then hop 2 twice — with hop 1's thinking blocks replayed, and with
    // them dropped (what a `carryReasoning: off` turn sends).
    const hop1 = await direct(directKey, {
      max_tokens: LOOP_MAX_TOKENS,
      thinking: { type: "between_tools" },
      tools: [{ ...NATIVE_WEATHER, strict: true }],
      messages: [userTurn(LOOP_PROMPT)],
    });
    recordDirect("loop-hop1", hop1, { thinkingChars: hop1.blocks.reduce((n, b) => n + (typeof b.thinking === "string" ? b.thinking.length : 0), 0) });
    const toolUse = hop1.blocks.find((b) => b.type === "tool_use");
    if (hop1.status === 200 && toolUse?.id !== undefined) {
      const result = { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: "14 C, light rain" }] };
      const kept = hop1.blocks;
      const dropped = hop1.blocks.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
      for (const [arm, content] of [
        ["loop-hop2-thinking-kept", kept],
        ["loop-hop2-thinking-dropped", dropped],
      ] as const) {
        recordDirect(
          arm,
          await direct(directKey, {
            max_tokens: LOOP_MAX_TOKENS,
            thinking: { type: "between_tools" },
            tools: [{ ...NATIVE_WEATHER, strict: true }],
            messages: [userTurn(LOOP_PROMPT), { role: "assistant", content }, result],
          }),
        );
      }
    }

    const nonce = `or14-${Date.now().toString(36)}`;
    for (const lines of CACHE_SWEEP_LINES) {
      recordDirect(
        `cache-${lines}-lines`,
        await direct(directKey, {
          max_tokens: 8,
          thinking: { type: "between_tools" },
          system: [{ type: "text", text: filler(`${nonce}-${lines}`, lines), cache_control: { type: "ephemeral" } }],
          messages: [userTurn(PROMPT)],
        }),
        { lines },
      );
    }
  }

  if (groups.includes("off") && orKey.length > 0) {
    const ask = [userTurn(PROMPT)];
    recordOr("reasoning-effort-none", await openrouter(orKey, { reasoning: { effort: "none" }, messages: ask }));
    recordOr("reasoning-enabled-false", await openrouter(orKey, { reasoning: { enabled: false }, messages: ask }));
    recordOr("reasoning-effort-high", await openrouter(orKey, { reasoning: { effort: "high" }, messages: ask }));
    recordOr("tool-choice-required", await openrouter(orKey, { tools: [OR_WEATHER], tool_choice: "required", messages: [userTurn(LOOP_PROMPT)] }));
  }

  const tail = [userTurn(TAIL_QUESTION), systemTurn(TAIL_NOTE)];
  const legalMid = [userTurn("Hi there."), systemTurn(MID_NOTE), assistantTurn("Hello! How can I help?"), userTurn("What is 2 + 2?")];
  const obeyed = (text: string): boolean => text.includes(CODEWORD);

  if (groups.includes("system") && directKey.length > 0) {
    const off = { thinking: { type: "between_tools" }, output_config: { effort: "low" } };
    for (let trial = 1; trial <= SYSTEM_TRIALS; trial += 1) {
      const tailRun = await direct(directKey, { ...off, messages: tail });
      recordDirect("system-tail", tailRun, { trial, obeyed: obeyed(tailRun.text) });
      const midRun = await direct(directKey, { ...off, messages: legalMid });
      recordDirect("system-mid-legal", midRun, { trial, obeyed: obeyed(midRun.text) });
    }
    recordDirect(
      "system-mid-illegal",
      await direct(directKey, { ...off, messages: [userTurn("Hi there."), assistantTurn("Hello!"), systemTurn(MID_NOTE), userTurn("What is 2 + 2?")] }),
    );
    const scoped = (clearAt: boolean): Record<string, unknown>[] => [
      userTurn("Keep this conversation short."),
      { ...systemTurn(SECRET_NOTE), ...(clearAt ? { clear_at: "next_user_message" } : {}) },
      assistantTurn("Understood."),
      userTurn(SECRET_QUESTION),
    ];
    const cleared = await direct(directKey, { ...off, messages: scoped(true) }, CLEAR_AT_BETA);
    recordDirect("clear-at-next-user-message", cleared, { sawSecret: cleared.text.includes(SECRET) });
    const kept = await direct(directKey, { ...off, messages: scoped(false) }, CLEAR_AT_BETA);
    recordDirect("clear-at-control", kept, { sawSecret: kept.text.includes(SECRET) });
  }

  if (groups.includes("system") && orKey.length > 0) {
    const off = { max_tokens: SYSTEM_MAX_TOKENS, reasoning: { effort: "low" } };
    for (let trial = 1; trial <= SYSTEM_TRIALS; trial += 1) {
      const tailRun = await openrouter(orKey, { ...off, messages: tail });
      recordOr("system-tail", tailRun, { trial, obeyed: obeyed(tailRun.text) });
      const midRun = await openrouter(orKey, { ...off, messages: legalMid });
      recordOr("system-mid-legal", midRun, { trial, obeyed: obeyed(midRun.text) });
    }
  }

  // OpenRouter's Anthropic-compatible Messages endpoint forwards native `thinking` fields; the chat-completions body
  // orbweaver sends has none. These arms ask whether that endpoint passes Sonnet 5.5's off through at all.
  if (groups.includes("or-messages") && orKey.length > 0) {
    for (const [arm, thinking] of [
      ["or-messages-between-tools", { type: "between_tools" }],
      ["or-messages-disabled", { type: "disabled" }],
    ] as const) {
      const response = await fetch(OR_MESSAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${orKey}`, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: OR_MODEL_ID, provider: ANTHROPIC_PIN, max_tokens: SHORT_MAX_TOKENS, thinking, messages: [userTurn(PROMPT)] }),
      });
      const json = (await response.json()) as NativeResponse & { readonly usage?: { readonly cost?: number } };
      addSpend(json.usage?.cost ?? 0);
      const row = {
        kind: "arm",
        probe: id,
        wire: "openrouter-messages",
        arm,
        status: response.status,
        generationId: json.id ?? null,
        error: json.error === undefined ? null : JSON.stringify(json.error).slice(0, 600),
        blockTypes: (json.content ?? []).map((b) => b.type ?? "?").join(","),
      };
      out.append(row);
      rows.push(row);
    }
  }

  const verdict = {
    kind: "verdict",
    probe: id,
    at: new Date().toISOString(),
    groups,
    arms: rows.map((r) => `${String(r["wire"])}:${String(r["arm"])} status=${String(r["status"])}`),
    openrouterSpend: totalSpend(),
    directTokens,
  };
  out.append(verdict);
  printTable(
    rows.map(({ wire, arm, trial, status, requestId, generationId, blockTypes, inputTokens, cacheWrite, obeyed: obey, sawSecret, upstreamRoles }) => ({
      wire,
      arm,
      trial,
      status,
      id: requestId ?? generationId,
      blockTypes,
      inputTokens,
      cacheWrite,
      obeyed: obey,
      sawSecret,
      upstreamRoles,
    })),
  );
  for (const r of rows.filter((row) => row["error"] !== null)) {
    console.log(`${String(r["wire"])} ${String(r["arm"])}: ${String(r["error"])}`);
  }
  for (const r of rows.filter((row) => row["wire"] === "openrouter")) {
    console.log(
      `${String(r["arm"])} upstream thinking=${JSON.stringify(r["upstreamThinking"])} output_config=${JSON.stringify(r["upstreamOutputConfig"])} tool_choice=${JSON.stringify(r["upstreamToolChoice"])} reasoningChars=${String(r["reasoningChars"])}`,
    );
  }
  for (const r of rows.filter((row) => String(row["arm"]).startsWith("system") || String(row["arm"]).startsWith("clear"))) {
    console.log(`${String(r["wire"])} ${String(r["arm"])} #${String(r["trial"] ?? "-")}: ${JSON.stringify(r["replyHead"])}`);
  }
  return verdict;
}
